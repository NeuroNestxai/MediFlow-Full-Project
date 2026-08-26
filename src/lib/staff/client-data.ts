import { createClient } from "@/lib/supabase/client";
import type { DbAppointmentStatus } from "@/lib/patient/types";
import {
  STAFF_APPOINTMENT_SELECT,
  STAFF_SLOT_OFFER_SELECT,
  CONSULTATION_SELECT,
  FOLLOW_UP_SELECT,
  normalizeStaffAppointments,
  normalizeLookup,
  normalizeConsultation,
  normalizeFollowUps,
  normalizeReportedHealth,
  normalizeStaffSlotOffers,
} from "./normalize";
import type {
  AppointmentLookup,
  Consultation,
  DoctorAvailabilitySlot,
  DoctorConsultationSummary,
  FollowUp,
  FollowUpType,
  PatientSearchResult,
  ReportedHealth,
  StaffAppointment,
  StaffNotification,
  StaffSlotOffer,
  VisitSummary,
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

/**
 * A collision-proof suffix for Realtime channel topics. The browser Supabase
 * client is a singleton, so every subscription must own a distinct channel name
 * — otherwise a second subscriber (or a Strict-Mode remount) would try to add
 * handlers to an already-subscribed channel and Supabase would throw.
 */
function uniqueId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the timestamp/random fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
// Reception approvals � a new booking starts as `pending_approval` until
// reception reviews it. Both RPCs require the reception/admin account to be
// MFA-enrolled (private.require_aal2()); without it the database itself
// refuses the call with `mfa_required` � surfaced below as its own reason so
// the UI can explain exactly what to do, not just show a generic error.
// ---------------------------------------------------------------------------

export type ApprovalResult =
  | { ok: true; reference: string; status: DbAppointmentStatus }
  | { ok: false; reason: "mfa_required" | "not_allowed" | "not_found" | "error" };

function toApproval(
  data: unknown,
  error: { code?: string; message?: string } | null,
): ApprovalResult {
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("mfa_required")) return { ok: false, reason: "mfa_required" };
    if (msg.includes("not_found")) return { ok: false, reason: "not_found" };
    if (
      error.code === "42501" ||
      msg.includes("not_authorized") ||
      msg.includes("invalid_transition")
    ) {
      return { ok: false, reason: "not_allowed" };
    }
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { reference: string; status: string }
    | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, reference: row.reference, status: row.status as DbAppointmentStatus };
}

/** Approves a pending booking request, moving it to `scheduled`. */
export async function approveAppointment(appointmentId: string): Promise<ApprovalResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("approve_appointment", {
    p_appointment_id: appointmentId,
  });
  return toApproval(data, error);
}

/** Rejects a pending booking request. `reason` is optional and shown to the patient. */
export async function rejectAppointment(
  appointmentId: string,
  reason?: string,
): Promise<ApprovalResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reject_appointment", {
    p_appointment_id: appointmentId,
    p_reason: reason && reason.trim() ? reason.trim() : null,
  });
  return toApproval(data, error);
}

// ---------------------------------------------------------------------------
// "Move earlier" -- reception's final approval step. The patient side
// (opt-in + accepting/declining an offer) lives in @/lib/patient/client-data.
// ---------------------------------------------------------------------------

export type SlotOfferDecisionResult =
  | { ok: true; status: string }
  | { ok: false; reason: "mfa_required" | "not_allowed" | "not_found" | "error" };

function toSlotOfferDecision(
  data: unknown,
  error: { code?: string; message?: string } | null,
): SlotOfferDecisionResult {
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("mfa_required")) return { ok: false, reason: "mfa_required" };
    if (msg.includes("offer_not_found")) return { ok: false, reason: "not_found" };
    if (
      error.code === "42501" ||
      msg.includes("not_authorized") ||
      msg.includes("offer_not_accepted") ||
      msg.includes("appointment_not_movable") ||
      msg.includes("slot_taken")
    ) {
      return { ok: false, reason: "not_allowed" };
    }
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, status: row.status };
}

/** Fetches every "accepted" (awaiting reception) move-earlier request, with
 * the MF ID joined in separately since the underlying view doesn't carry it. */
export async function fetchPendingSlotOffers(): Promise<StaffSlotOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dashboard_slot_offers_pending")
    .select(STAFF_SLOT_OFFER_SELECT)
    .order("offer_date", { ascending: true });
  if (error) return [];

  const rows = (data ?? []) as { reference: string }[];
  const references = Array.from(new Set(rows.map((r) => r.reference)));
  let patientRefByReference: Record<string, string | null> = {};
  if (references.length > 0) {
    const { data: apptRows } = await supabase
      .from("appointments")
      .select("reference, patient_ref")
      .in("reference", references);
    patientRefByReference = Object.fromEntries(
      ((apptRows ?? []) as { reference: string; patient_ref: string | null }[]).map((r) => [
        r.reference,
        r.patient_ref,
      ]),
    );
  }

  return normalizeStaffSlotOffers(data, patientRefByReference);
}

/** Actually moves the appointment to the earlier slot. */
export async function approveSlotOffer(offerId: string): Promise<SlotOfferDecisionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("approve_slot_offer", { p_offer_id: offerId });
  return toSlotOfferDecision(data, error);
}

/** Leaves the patient's original appointment untouched and automatically
 * offers the slot to the next eligible patient. */
export async function rejectSlotOffer(
  offerId: string,
  reason?: string,
): Promise<SlotOfferDecisionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reject_slot_offer", {
    p_offer_id: offerId,
    p_reason: reason && reason.trim() ? reason.trim() : null,
  });
  return toSlotOfferDecision(data, error);
}

// ---------------------------------------------------------------------------
// Visit summaries. Written by the AI agent only (agent_write_visit_summary,
// called from n8n after a consultation) -- there is deliberately no
// doctor-facing write path here, only read. RLS scopes reads to the treating
// doctor (or admin); a patient reads their own separately.
// ---------------------------------------------------------------------------

interface VisitSummaryRow {
  summary: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Null when the agent hasn't written one yet for this appointment -- not an error. */
export async function fetchVisitSummary(appointmentId: string): Promise<VisitSummary | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visit_summaries")
    .select("summary, status, created_at, updated_at")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as VisitSummaryRow;
  return { summary: r.summary, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
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
  // The browser Supabase client is a singleton, so a static channel topic would
  // be shared by every subscriber (dashboards, lists, the unread-count hook) and
  // adding a second `.on()` to that already-subscribed channel throws
  // "cannot add postgres_changes callbacks after subscribe()". A unique topic
  // per call gives each subscriber (and each Strict-Mode remount) its own
  // channel, torn down precisely in the returned cleanup.
  const channel = supabase
    .channel(`staff-appointments:${uniqueId()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Staff notifications (public.staff_notifications).
// Shared by Doctor + Reception; RLS decides which rows each role receives.
// Degrades to "unavailable" until the migration is applied.
// ---------------------------------------------------------------------------

export type StaffNotificationsLoad =
  | { status: "ready"; notifications: StaffNotification[] }
  | { status: "unavailable" }
  | { status: "error" };

interface StaffNotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  related_appointment_id: string | null;
  is_read: boolean;
  created_at: string;
}

export async function fetchStaffNotifications(): Promise<StaffNotificationsLoad> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_notifications")
    .select("id, type, title, message, related_appointment_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { status: isMissingObject(error.code) ? "unavailable" : "error" };
  const notifications = ((data ?? []) as StaffNotificationRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    relatedAppointmentId: r.related_appointment_id,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));
  return { status: "ready", notifications };
}

/** Unread badge count. Returns 0 (never throws) so a missing table can't break the nav. */
export async function fetchStaffUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("staff_notifications")
    .select("*", { head: true, count: "exact" })
    .eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
}

export async function markStaffNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("staff_mark_notification_read", { p_id: id });
  return { ok: !error };
}

export async function markAllStaffNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("staff_mark_all_notifications_read");
  return { ok: !error };
}

export function subscribeToStaffNotifications(onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`staff-notifications:${uniqueId()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_notifications" }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Doctor availability management (public.doctor_availability via RPCs).
// Every write re-derives the doctor from auth.uid(); booked slots are protected.
// ---------------------------------------------------------------------------

export type AvailabilityLoad =
  | { status: "ready"; slots: DoctorAvailabilitySlot[] }
  | { status: "unavailable" }
  | { status: "error" };

interface AvailabilityRow {
  availability_id: string;
  available_date: string;
  start_time: string;
  is_active: boolean;
  is_booked: boolean;
}

export async function fetchDoctorAvailability(
  from: string,
  to: string,
): Promise<AvailabilityLoad> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_list_availability", {
    p_from: from,
    p_to: to,
  });
  if (error) return { status: isMissingObject(error.code) ? "unavailable" : "error" };
  const slots = ((data ?? []) as AvailabilityRow[]).map((r) => ({
    id: r.availability_id,
    date: r.available_date,
    time: r.start_time,
    isActive: r.is_active,
    isBooked: r.is_booked,
  }));
  return { status: "ready", slots };
}

export type AvailabilityMutation =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "past" | "booked" | "invalid" | "error" };

function toAvailabilityMutation(error: { code?: string; message?: string } | null): AvailabilityMutation {
  if (!error) return { ok: true };
  if (isMissingObject(error.code)) return { ok: false, reason: "unavailable" };
  const msg = String(error.message ?? "");
  if (msg.includes("date_in_past")) return { ok: false, reason: "past" };
  if (msg.includes("slot_booked")) return { ok: false, reason: "booked" };
  if (msg.includes("invalid_range") || msg.includes("invalid_input")) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "error" };
}

export async function addDoctorAvailability(
  date: string,
  time: string,
): Promise<AvailabilityMutation> {
  const supabase = createClient();
  const { error } = await supabase.rpc("doctor_add_availability", {
    p_date: date,
    p_start_time: time,
  });
  return toAvailabilityMutation(error);
}

export async function setDoctorAvailabilityActive(
  id: string,
  active: boolean,
): Promise<AvailabilityMutation> {
  const supabase = createClient();
  const { error } = await supabase.rpc("doctor_set_availability_active", {
    p_availability_id: id,
    p_active: active,
  });
  return toAvailabilityMutation(error);
}

export type BlockAvailabilityResult =
  | { ok: true; blocked: number }
  | { ok: false; reason: "unavailable" | "past" | "booked" | "invalid" | "error" };

export async function blockDoctorAvailability(
  date: string,
  start: string,
  end: string,
): Promise<BlockAvailabilityResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("doctor_block_availability", {
    p_date: date,
    p_start_time: start,
    p_end_time: end,
  });
  if (error) {
    const m = toAvailabilityMutation(error);
    return { ok: false, reason: m.ok ? "error" : m.reason };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { blocked_count: number } | undefined;
  return { ok: true, blocked: row?.blocked_count ?? 0 };
}

// ---------------------------------------------------------------------------
// Doctor consultation notes workspace (public.consultations joined to the
// appointment). RLS returns ONLY the signed-in doctor's own consultations.
// ---------------------------------------------------------------------------

export type ConsultationsLoad =
  | { status: "ready"; consultations: DoctorConsultationSummary[] }
  | { status: "unavailable" }
  | { status: "error" };

interface ConsultationListRow {
  id: string;
  appointment_id: string;
  notes: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  appointment:
    | {
        reference: string;
        appointment_date: string;
        appointment_time: string;
        status: string;
        patient: { full_name: string | null; preferred_name: string | null } | { full_name: string | null; preferred_name: string | null }[] | null;
        service: { name: string } | { name: string }[] | null;
      }
    | null;
}

export async function fetchDoctorConsultations(): Promise<ConsultationsLoad> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("consultations")
    .select(
      "id, appointment_id, notes, status, started_at, completed_at, updated_at, " +
        "appointment:appointments(reference, appointment_date, appointment_time, status, " +
        "patient:profiles(full_name, preferred_name), service:services(name))",
    )
    .order("updated_at", { ascending: false });
  if (error) return { status: isMissingObject(error.code) ? "unavailable" : "error" };

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const consultations = ((data ?? []) as unknown as ConsultationListRow[]).map((r) => {
    const appt = r.appointment;
    const patient = one(appt?.patient);
    const service = one(appt?.service);
    const name =
      patient?.preferred_name?.trim() || patient?.full_name?.trim() || "Patient";
    return {
      id: r.id,
      appointmentId: r.appointment_id,
      status: r.status === "completed" ? ("completed" as const) : ("draft" as const),
      updatedAt: r.updated_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      hasNotes: Boolean(r.notes && r.notes.trim()),
      reference: appt?.reference ?? "—",
      date: appt?.appointment_date ?? "",
      time: appt?.appointment_time ?? "",
      appointmentStatus: (appt?.status ?? "scheduled") as DbAppointmentStatus,
      patientName: name,
      serviceName: service?.name ?? null,
    };
  });
  return { status: "ready", consultations };
}

// ---------------------------------------------------------------------------
// Clinic availability overview (reception). Reads public.doctor_availability
// directly — RLS returns all active rows to reception, own rows to a doctor.
// Used only to compute "next available slot" on the Reception Doctors board;
// booking still goes through the role-gated RPCs below.
// ---------------------------------------------------------------------------

export interface ClinicSlot {
  doctorId: string;
  date: string;
  time: string;
}

export async function fetchClinicAvailability(fromDate: string): Promise<ClinicSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("doctor_availability")
    .select("doctor_id, available_date, start_time")
    .eq("is_active", true)
    .gte("available_date", fromDate)
    .order("available_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(2000);
  if (error) return [];
  interface Row {
    doctor_id: string;
    available_date: string;
    start_time: string;
  }
  return ((data ?? []) as Row[]).map((r) => ({
    doctorId: r.doctor_id,
    date: r.available_date,
    time: r.start_time,
  }));
}

// ---------------------------------------------------------------------------
// Reception-assisted booking (public.staff_* RPCs).
// ---------------------------------------------------------------------------

export async function staffSearchPatients(query: string): Promise<PatientSearchResult[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_search_patients", { p_query: query });
  if (error) return [];
  interface Row {
    patient_id: string;
    full_name: string | null;
    preferred_name: string | null;
    phone: string | null;
  }
  return ((data ?? []) as Row[]).map((r) => ({
    patientId: r.patient_id,
    name: r.preferred_name?.trim() || r.full_name?.trim() || "Patient",
    phone: r.phone,
  }));
}

interface StaffSlotRow {
  availability_id: string;
  available_date: string;
  start_time: string;
  is_demo: boolean;
  source_label: string | null;
}

export interface StaffSlot {
  availabilityId: string;
  date: string;
  time: string;
  isDemo: boolean;
  sourceLabel: string | null;
}

export type StaffSlotsLoad =
  | { status: "ready"; slots: StaffSlot[] }
  | { status: "unavailable" }
  | { status: "error" };

export async function staffFetchAvailableSlots(
  doctorId: string,
  serviceId: string,
): Promise<StaffSlotsLoad> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_get_available_slots", {
    p_doctor_id: doctorId,
    p_service_id: serviceId,
  });
  if (error) return { status: isMissingObject(error.code) ? "unavailable" : "error" };
  const slots = ((data ?? []) as StaffSlotRow[]).map((r) => ({
    availabilityId: r.availability_id,
    date: r.available_date,
    time: r.start_time,
    isDemo: r.is_demo,
    sourceLabel: r.source_label,
  }));
  return { status: "ready", slots };
}

export type StaffCreateAppointmentResult =
  | { ok: true; reference: string; date: string; time: string; status: DbAppointmentStatus }
  | { ok: false; reason: "conflict" | "unavailable" | "invalid" | "error" };

export async function staffCreateAppointment(input: {
  patientId: string;
  doctorId: string;
  serviceId: string;
  availabilityId: string;
  notes: string | null;
}): Promise<StaffCreateAppointmentResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_create_appointment", {
    p_patient_id: input.patientId,
    p_doctor_id: input.doctorId,
    p_service_id: input.serviceId,
    p_availability_id: input.availabilityId,
    p_patient_notes: input.notes,
  });
  if (error) {
    if (isMissingObject(error.code)) return { ok: false, reason: "unavailable" };
    const msg = String(error.message ?? "");
    if (error.code === "23505" || msg.includes("slot_unavailable")) return { ok: false, reason: "conflict" };
    if (
      msg.includes("invalid_patient") ||
      msg.includes("invalid_doctor") ||
      msg.includes("invalid_service") ||
      msg.includes("service_not_offered") ||
      msg.includes("invalid_availability")
    ) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { reference: string; appointment_date: string; appointment_time: string; status: string }
    | undefined;
  if (!row) return { ok: false, reason: "error" };
  return {
    ok: true,
    reference: row.reference,
    date: row.appointment_date,
    time: row.appointment_time,
    status: row.status as DbAppointmentStatus,
  };
}
