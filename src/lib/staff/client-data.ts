import { createClient } from "@/lib/supabase/client";
import type { DbAppointmentStatus } from "@/lib/patient/types";
import {
  STAFF_APPOINTMENT_SELECT,
  CONSULTATION_SELECT,
  FOLLOW_UP_SELECT,
  normalizeStaffAppointments,
  normalizeLookup,
  normalizeConsultation,
  normalizeFollowUps,
  normalizeReportedHealth,
} from "./normalize";
import type {
  AppointmentLookup,
  Consultation,
  FollowUp,
  FollowUpType,
  ReportedHealth,
  StaffAppointment,
} from "./types";

// ---------------------------------------------------------------------------
// Browser-side reads + mutations for Doctor and Reception.
//
// Conventions carried over from `@/lib/patient/client-data`:
//   * a fresh authenticated browser client per call (no shared singleton),
//   * RLS decides what comes back — never a service-role key,
//   * every write goes through a SECURITY DEFINER RPC, never a direct
//     INSERT/UPDATE, so the database enforces the state machine,
//   * raw Supabase errors are never surfaced; reads throw a machine code and
//     writes return a discriminated union the UI can render safely.
// ---------------------------------------------------------------------------

/** `true` when the feature's migration has not been applied yet. */
function isMissingObject(code?: string): boolean {
  return code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface AppointmentQuery {
  /** ISO date. Omit for "all upcoming and today". */
  date?: string;
  statuses?: DbAppointmentStatus[];
}

/**
 * Appointments visible to the caller. RLS already scopes this: reception sees
 * the whole clinic, a doctor sees only their own — no client-side filtering is
 * relied on for security.
 */
export async function fetchStaffAppointments(
  query: AppointmentQuery = {},
): Promise<StaffAppointment[]> {
  const supabase = createClient();
  let q = supabase.from("appointments").select(STAFF_APPOINTMENT_SELECT);
  if (query.date) q = q.eq("appointment_date", query.date);
  if (query.statuses?.length) q = q.in("status", query.statuses);
  const { data, error } = await q
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });
  if (error) throw new Error("staff_appointments_load_failed");
  return normalizeStaffAppointments(data);
}

export async function fetchAppointmentById(id: string): Promise<StaffAppointment | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(STAFF_APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("staff_appointment_load_failed");
  return data ? normalizeStaffAppointments([data])[0] : null;
}

/** Patient-reported allergies/medications. Treating doctor only (enforced by RLS). */
export async function fetchReportedHealth(
  patientId: string,
): Promise<{ status: "ready"; health: ReportedHealth | null } | { status: "unavailable" | "error" }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patient_reported_health")
    .select("allergies, current_medications")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) return { status: isMissingObject(error.code) ? "unavailable" : "error" };
  return { status: "ready", health: data ? normalizeReportedHealth(data) : null };
}

export async function fetchConsultation(appointmentId: string): Promise<Consultation | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("consultations")
    .select(CONSULTATION_SELECT)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error) return null;
  return data ? normalizeConsultation(data) : null;
}

export async function fetchFollowUps(): Promise<FollowUp[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT)
    .order("due_date", { ascending: true });
  if (error) throw new Error("follow_ups_load_failed");
  return normalizeFollowUps(data);
}

// ---------------------------------------------------------------------------
// Reception mutations
// ---------------------------------------------------------------------------

export type LookupResult =
  | { ok: true; appointment: AppointmentLookup }
  | { ok: false; reason: "not_found" | "invalid" | "error" };

/** QR scan or manual booking-reference entry. Returns operational data only. */
export async function lookupAppointment(reference: string): Promise<LookupResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_lookup_appointment", {
    p_reference: reference,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("invalid_reference")) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "error" };
  }
  const appointment = normalizeLookup(data);
  if (!appointment) return { ok: false, reason: "not_found" };
  return { ok: true, appointment };
}

// ---------------------------------------------------------------------------
// Booking approvals (reception/admin). New bookings arrive as
// `pending_approval`; approve → `scheduled`, reject → `rejected`. Both server
// RPCs additionally require the staff session to be at AAL2 (two-factor), so a
// dedicated `mfa_required` reason is surfaced for a clear in-UI message.
// ---------------------------------------------------------------------------

export type ApprovalResult =
  | { ok: true; reference: string; status: DbAppointmentStatus }
  | { ok: false; reason: "mfa_required" | "not_allowed" | "not_pending" | "not_found" | "error" };

function toApproval(data: unknown, error: { code?: string; message?: string } | null): ApprovalResult {
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("mfa_required")) return { ok: false, reason: "mfa_required" };
    if (msg.includes("not_pending_approval")) return { ok: false, reason: "not_pending" };
    if (msg.includes("not_found")) return { ok: false, reason: "not_found" };
    if (error.code === "42501" || msg.includes("not_authorized")) return { ok: false, reason: "not_allowed" };
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { reference: string; status: string } | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, reference: row.reference, status: row.status as DbAppointmentStatus };
}

/** Approve a pending booking → `scheduled` (queues the confirmation email). */
export async function approveAppointment(appointmentId: string): Promise<ApprovalResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("approve_appointment", {
    p_appointment_id: appointmentId,
  });
  return toApproval(data, error);
}

/** Reject a pending booking → `rejected` (queues the update email, with reason). */
export async function rejectAppointment(
  appointmentId: string,
  reason?: string,
): Promise<ApprovalResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reject_appointment", {
    p_appointment_id: appointmentId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });
  return toApproval(data, error);
}

export type TransitionResult =
  | { ok: true; reference: string; status: DbAppointmentStatus }
  | { ok: false; reason: "not_allowed" | "not_found" | "error" };

interface TransitionRow {
  reference: string;
  status: string;
}

function toTransition(data: unknown, error: { code?: string; message?: string } | null): TransitionResult {
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("not_found")) return { ok: false, reason: "not_found" };
    if (
      error.code === "42501" ||
      msg.includes("not_checkinable") ||
      msg.includes("not_checkoutable") ||
      msg.includes("not_completable") ||
      msg.includes("not_startable") ||
      msg.includes("invalid_transition") ||
      msg.includes("not_authorized")
    ) {
      return { ok: false, reason: "not_allowed" };
    }
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as TransitionRow | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, reference: row.reference, status: row.status as DbAppointmentStatus };
}

export async function checkInAppointment(appointmentId: string): Promise<TransitionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_check_in_appointment", {
    p_appointment_id: appointmentId,
  });
  return toTransition(data, error);
}

export async function updateQueueStatus(
  appointmentId: string,
  status: "waiting" | "no_show",
): Promise<TransitionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_update_queue_status", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  return toTransition(data, error);
}

export async function checkOutAppointment(appointmentId: string): Promise<TransitionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_check_out_appointment", {
    p_appointment_id: appointmentId,
  });
  return toTransition(data, error);
}

// ---------------------------------------------------------------------------
// Doctor mutations
// ---------------------------------------------------------------------------

export type StartConsultationResult =
  | { ok: true; consultationId: string; reference: string }
  | { ok: false; reason: "not_allowed" | "not_found" | "not_linked" | "error" };

export async function startConsultation(appointmentId: string): Promise<StartConsultationResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_start_consultation", {
    p_appointment_id: appointmentId,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("doctor_not_linked")) return { ok: false, reason: "not_linked" };
    if (msg.includes("not_found")) return { ok: false, reason: "not_found" };
    if (msg.includes("not_startable")) return { ok: false, reason: "not_allowed" };
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { consultation_id: string; reference: string }
    | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, consultationId: row.consultation_id, reference: row.reference };
}

/** Autosave. Returns false rather than throwing so a draft save never blocks typing. */
export async function saveConsultationNotes(
  appointmentId: string,
  notes: string,
): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("doctor_save_consultation_notes", {
    p_appointment_id: appointmentId,
    p_notes: notes,
  });
  return { ok: !error };
}

export async function completeConsultation(appointmentId: string): Promise<TransitionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_complete_consultation", {
    p_appointment_id: appointmentId,
  });
  return toTransition(data, error);
}

export async function markNoShow(appointmentId: string): Promise<TransitionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_mark_no_show", {
    p_appointment_id: appointmentId,
  });
  return toTransition(data, error);
}

export interface FollowUpInput {
  appointmentId: string;
  followUpType: FollowUpType;
  dueDate: string;
  instructions: string;
  setReminder: boolean;
  newAppointmentRequired: boolean;
  internalNotes?: string | null;
  /** false saves a draft the patient cannot see; true publishes it. */
  approve: boolean;
}

export type CreateFollowUpResult =
  | { ok: true; followUpId: string; status: "draft" | "approved" }
  | { ok: false; reason: "invalid" | "not_allowed" | "error" };

export async function createFollowUp(input: FollowUpInput): Promise<CreateFollowUpResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_create_follow_up", {
    p_appointment_id: input.appointmentId,
    p_follow_up_type: input.followUpType,
    p_due_date: input.dueDate,
    p_instructions: input.instructions,
    p_set_reminder: input.setReminder,
    p_new_appointment_required: input.newAppointmentRequired,
    p_internal_notes: input.internalNotes ?? null,
    p_approve: input.approve,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (
      msg.includes("invalid_type") ||
      msg.includes("instructions_required") ||
      msg.includes("instructions_too_long") ||
      msg.includes("invalid_due_date")
    ) {
      return { ok: false, reason: "invalid" };
    }
    if (msg.includes("not_authorized") || msg.includes("doctor_not_linked")) {
      return { ok: false, reason: "not_allowed" };
    }
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { follow_up_id: string; status: string }
    | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, followUpId: row.follow_up_id, status: row.status as "draft" | "approved" };
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/**
 * Subscribe to appointment changes so the Doctor and Reception dashboards
 * update without a manual refresh. RLS still governs which rows arrive, and
 * the caller also refetches — Realtime is a progressive enhancement, never the
 * only path to correct data.
 */
export function subscribeToAppointments(onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel("staff-appointments")
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
