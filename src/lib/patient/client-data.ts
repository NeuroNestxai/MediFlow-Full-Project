import { createClient } from "@/lib/supabase/client";
import type {
  DirectoryService,
  DirectoryDoctor,
  PatientAppointment,
  AvailableSlot,
  Specialty,
  DbAppointmentStatus,
  SlotOffer,
} from "./types";
import {
  SPECIALTY_SELECT,
  SERVICE_SELECT,
  DOCTOR_SELECT,
  APPOINTMENT_SELECT,
  SLOT_OFFER_SELECT,
  normalizeSpecialties,
  normalizeServices,
  normalizeDoctors,
  normalizeAppointments,
  normalizeSlots,
  normalizeSlotOffers,
} from "./normalize";

// Every function below uses the normal authenticated browser client. RLS
// governs what is returned; raw errors are never surfaced to callers.

export async function fetchSpecialties(): Promise<Specialty[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("specialties").select(SPECIALTY_SELECT).order("name");
  if (error) throw new Error("specialties_load_failed");
  return normalizeSpecialties(data);
}

export async function fetchServices(): Promise<DirectoryService[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("services").select(SERVICE_SELECT).order("name");
  if (error) throw new Error("services_load_failed");
  return normalizeServices(data);
}

export async function fetchDoctors(): Promise<DirectoryDoctor[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("doctors").select(DOCTOR_SELECT).order("full_name");
  if (error) throw new Error("doctors_load_failed");
  return normalizeDoctors(data);
}

export async function fetchMyAppointments(): Promise<PatientAppointment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });
  if (error) throw new Error("appointments_load_failed");
  return normalizeAppointments(data);
}

// ---------------------------------------------------------------------------
// "Move earlier" opt-in + slot offers.
// ---------------------------------------------------------------------------

/** Opts an upcoming appointment in or out of being offered an earlier slot. */
export async function setWantsEarlier(
  appointmentId: string,
  wants: boolean,
): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("patient_set_wants_earlier", {
    p_appointment_id: appointmentId,
    p_wants: wants,
  });
  return { ok: !error };
}

/** Every slot offer this patient has ever received, newest first. The UI
 * decides what to show -- typically only `status === "offered"` rows need
 * a response; the rest are just history. */
export async function fetchMySlotOffers(): Promise<SlotOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dashboard_my_slot_offers")
    .select(SLOT_OFFER_SELECT)
    .order("offer_date", { ascending: true });
  if (error) return [];
  return normalizeSlotOffers(data);
}

export type SlotOfferResponseResult =
  | { ok: true; status: string }
  | { ok: false; reason: "expired" | "not_open" | "not_found" | "error" };

/** Accept moves the request to "accepted" (awaiting reception's final
 * approval); decline leaves the patient's own appointment untouched and
 * automatically offers the slot to the next eligible patient. */
export async function respondToSlotOffer(
  offerId: string,
  accept: boolean,
): Promise<SlotOfferResponseResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("respond_slot_offer", {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("offer_expired")) return { ok: false, reason: "expired" };
    if (msg.includes("offer_not_open")) return { ok: false, reason: "not_open" };
    if (msg.includes("offer_not_found")) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, status: row.status };
}

/** Available slots (v2 RPC) — includes is_demo + source_label. Never reads the
 * doctor_availability table directly, and never exposes source_schedule_id. */
export async function fetchAvailableSlots(
  doctorId: string,
  serviceId: string,
): Promise<AvailableSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_available_slots_v2", {
    p_doctor_id: doctorId,
    p_service_id: serviceId,
  });
  if (error) throw new Error("slots_load_failed");
  return normalizeSlots(data);
}

export type CreateAppointmentResult =
  | {
      ok: true;
      reference: string;
      date: string;
      time: string;
      status: DbAppointmentStatus;
    }
  | { ok: false; conflict: boolean };

interface CreateRow {
  reference: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
}

export async function createAppointment(input: {
  doctorId: string;
  serviceId: string;
  availabilityId: string;
  notes: string | null;
}): Promise<CreateAppointmentResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_patient_appointment", {
    p_doctor_id: input.doctorId,
    p_service_id: input.serviceId,
    p_availability_id: input.availabilityId,
    p_patient_notes: input.notes,
  });

  if (error) {
    // 23505 / 'slot_unavailable' ⇒ the slot was just taken by someone else.
    const conflict =
      error.code === "23505" ||
      (typeof error.message === "string" && error.message.includes("slot_unavailable"));
    return { ok: false, conflict };
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreateRow | undefined;
  if (!row) return { ok: false, conflict: false };

  return {
    ok: true,
    reference: row.reference,
    date: row.appointment_date,
    time: row.appointment_time,
    status: row.status as DbAppointmentStatus,
  };
}

export async function cancelAppointment(appointmentId: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_patient_appointment", {
    p_appointment_id: appointmentId,
  });
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Patient-reported health (own row in public.patient_reported_health).
// Gracefully degrades to "unavailable" until migration 5 is applied.
// ---------------------------------------------------------------------------
export type HealthLoad =
  | { status: "ready"; allergies: string; medications: string }
  | { status: "unavailable" }
  | { status: "error" };

function isMissingTable(code: string | undefined): boolean {
  return code === "PGRST205" || code === "PGRST202" || code === "42P01";
}

export async function fetchHealth(): Promise<HealthLoad> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" };
  const { data, error } = await supabase
    .from("patient_reported_health")
    .select("allergies, current_medications")
    .eq("patient_id", user.id)
    .maybeSingle();
  if (error) return isMissingTable(error.code) ? { status: "unavailable" } : { status: "error" };
  return {
    status: "ready",
    allergies: (data?.allergies as string | null) ?? "",
    medications: (data?.current_medications as string | null) ?? "",
  };
}

export async function saveHealth(input: {
  allergies: string;
  medications: string;
}): Promise<{ ok: boolean; unavailable?: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("patient_reported_health").upsert(
    {
      patient_id: user.id,
      allergies: input.allergies.trim() ? input.allergies.trim() : null,
      current_medications: input.medications.trim() ? input.medications.trim() : null,
    },
    { onConflict: "patient_id" },
  );
  if (error) return { ok: false, unavailable: isMissingTable(error.code) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// In-app Patient Notifications (public.patient_notifications).
// Gracefully degrades to "unavailable" until migration 7 is applied.
// ---------------------------------------------------------------------------
export interface PatientNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedAppointmentId: string | null;
  relatedDocumentId: string | null;
  isRead: boolean;
  createdAt: string;
}

export type NotificationsLoad =
  | { status: "ready"; notifications: PatientNotification[] }
  | { status: "unavailable" }
  | { status: "error" };

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  related_appointment_id: string | null;
  related_document_id: string | null;
  is_read: boolean;
  created_at: string;
}

export async function fetchNotifications(): Promise<NotificationsLoad> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patient_notifications")
    .select("id, type, title, message, related_appointment_id, related_document_id, is_read, created_at")
    .order("created_at", { ascending: false });
  if (error) return isMissingTable(error.code) ? { status: "unavailable" } : { status: "error" };
  const notifications = ((data ?? []) as NotificationRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    relatedAppointmentId: r.related_appointment_id,
    relatedDocumentId: r.related_document_id,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));
  return { status: "ready", notifications };
}

export async function fetchUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("patient_notifications")
    .select("*", { head: true, count: "exact" })
    .eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  return { ok: !error };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Private Patient Documents (Supabase Storage + public.patient_documents).
// Gracefully degrades to "unavailable" until migration 6 + bucket exist.
// ---------------------------------------------------------------------------
const DOCS_BUCKET = "patient-documents";
const DOC_ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface PatientDocument {
  id: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sourceType: string;
  createdAt: string;
}

export type DocumentsLoad =
  | { status: "ready"; documents: PatientDocument[] }
  | { status: "unavailable" }
  | { status: "error" };

interface DocumentRow {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  source_type: string;
  created_at: string;
}

/** Client-side pre-validation (RLS + bucket limits enforce server-side too). */
export function validateDocumentFile(file: File): string | null {
  if (!DOC_ALLOWED_MIME.includes(file.type)) {
    return "Only PDF, PNG, JPG, or WebP files are allowed.";
  }
  if (file.size > DOC_MAX_BYTES) {
    return "Files must be 10 MB or smaller.";
  }
  if (file.size === 0) {
    return "This file appears to be empty.";
  }
  return null;
}

function extensionFor(file: File): string {
  const byMime: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return byMime[file.type] ?? "bin";
}

/** Keep a readable original filename for display only (never used as a path). */
function sanitizeFilename(name: string): string {
  return name.replace(/[ -/\\]+/g, "_").slice(0, 255) || "document";
}

export async function fetchDocuments(): Promise<DocumentsLoad> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patient_documents")
    .select("id, original_filename, storage_path, mime_type, size_bytes, source_type, created_at")
    .order("created_at", { ascending: false });
  if (error) return isMissingTable(error.code) ? { status: "unavailable" } : { status: "error" };
  const documents = ((data ?? []) as DocumentRow[]).map((r) => ({
    id: r.id,
    originalFilename: r.original_filename,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    sourceType: r.source_type,
    createdAt: r.created_at,
  }));
  return { status: "ready", documents };
}

export async function uploadDocument(
  file: File,
): Promise<{ ok: boolean; unavailable?: boolean; error?: string }> {
  const invalid = validateDocumentFile(file);
  if (invalid) return { ok: false, error: invalid };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };

  // Collision-safe object name in the caller's own folder.
  const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    const msg = typeof upErr.message === "string" ? upErr.message : "";
    if (msg.toLowerCase().includes("bucket not found")) return { ok: false, unavailable: true };
    return { ok: false, error: "We couldn't upload this file. Please try again." };
  }

  const { error: metaErr } = await supabase.from("patient_documents").insert({
    patient_id: user.id,
    original_filename: sanitizeFilename(file.name),
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    source_type: "patient_uploaded",
  });
  if (metaErr) {
    // Roll back the orphaned object so storage + metadata stay consistent.
    await supabase.storage.from(DOCS_BUCKET).remove([path]);
    if (isMissingTable(metaErr.code)) return { ok: false, unavailable: true };
    return { ok: false, error: "We couldn't save this file. Please try again." };
  }
  return { ok: true };
}

/** Short-lived signed URL (60s). Never expose the raw storage path in links. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteDocument(doc: PatientDocument): Promise<{ ok: boolean }> {
  const supabase = createClient();
  // Remove the object first, then the metadata row (RLS confines both to owner
  // + patient_uploaded). Only this file's path is touched.
  const { error: rmErr } = await supabase.storage.from(DOCS_BUCKET).remove([doc.storagePath]);
  if (rmErr) return { ok: false };
  const { error: metaErr } = await supabase.from("patient_documents").delete().eq("id", doc.id);
  return { ok: !metaErr };
}

/** A doctor-approved follow-up as the patient sees it. */
export interface PatientFollowUp {
  id: string;
  followUpType: string;
  typeLabel: string;
  dueDate: string;
  instructions: string;
  newAppointmentRequired: boolean;
  doctorName: string | null;
  createdAt: string;
}

const FOLLOW_UP_TYPE_LABEL: Record<string, string> = {
  recheck: "Recheck",
  test_review: "Test review",
  medication_review: "Medication review",
  general_check_in: "General check-in",
};

/**
 * The signed-in patient's follow-ups.
 *
 * RLS returns only rows the doctor has actually approved — drafts are
 * invisible here, and `internal_notes` is deliberately never selected. The
 * status filter below is defence in depth, not the security boundary.
 */
export async function fetchMyFollowUps(): Promise<
  { status: "ready"; followUps: PatientFollowUp[] } | { status: "unavailable" | "error" }
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .select(
      "id, follow_up_type, due_date, instructions, new_appointment_required, created_at, doctor:doctors(full_name)",
    )
    .in("status", ["approved", "completed"])
    .order("due_date", { ascending: true });

  if (error) {
    return { status: isMissingTable(error.code) ? "unavailable" : "error" };
  }

  interface Row {
    id: string;
    follow_up_type: string;
    due_date: string;
    instructions: string;
    new_appointment_required: boolean;
    created_at: string;
    doctor: { full_name: string } | { full_name: string }[] | null;
  }

  const followUps = (data ?? []).map((row) => {
    const r = row as unknown as Row;
    const doctor = Array.isArray(r.doctor) ? r.doctor[0] : r.doctor;
    return {
      id: r.id,
      followUpType: r.follow_up_type,
      typeLabel: FOLLOW_UP_TYPE_LABEL[r.follow_up_type] ?? "Follow-up",
      dueDate: r.due_date,
      instructions: r.instructions,
      newAppointmentRequired: r.new_appointment_required,
      doctorName: doctor?.full_name ?? null,
      createdAt: r.created_at,
    };
  });

  return { status: "ready", followUps };
}

export type RescheduleResult =
  | { ok: true; reference: string; date: string; time: string; status: DbAppointmentStatus }
  | { ok: false; conflict: boolean };

interface RescheduleRow {
  reference: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
}

export async function rescheduleAppointment(input: {
  appointmentId: string;
  availabilityId: string;
}): Promise<RescheduleResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reschedule_patient_appointment", {
    p_appointment_id: input.appointmentId,
    p_availability_id: input.availabilityId,
  });

  if (error) {
    const conflict =
      error.code === "23505" ||
      (typeof error.message === "string" && error.message.includes("slot_unavailable"));
    return { ok: false, conflict };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RescheduleRow | undefined;
  if (!row) return { ok: false, conflict: false };

  return {
    ok: true,
    reference: row.reference,
    date: row.appointment_date,
    time: row.appointment_time,
    status: row.status as DbAppointmentStatus,
  };
}
