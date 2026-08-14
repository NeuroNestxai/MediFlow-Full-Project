import type { DbAppointmentStatus } from "@/lib/patient/types";
import type { AppointmentLookup, Consultation, FollowUp, FollowUpType, ReportedHealth, StaffAppointment } from "./types";

// ---------------------------------------------------------------------------
// Shared PostgREST select strings + row→domain mapping for staff reads.
// Exported so server and client queries can never drift, exactly as
// `@/lib/patient/normalize` does for the patient slice.
// ---------------------------------------------------------------------------

/**
 * Staff appointment shape. Includes the patient profile embed, which RLS only
 * returns to reception, or to a doctor for their own patients.
 */
export const STAFF_APPOINTMENT_SELECT =
  "id, reference, appointment_date, appointment_time, status, patient_id, patient_ref, doctor_id, patient_notes, " +
  "patient:profiles(full_name, preferred_name, phone), " +
  "doctor:doctors(full_name, portrait_palette), " +
  "service:services(name)";

export const CONSULTATION_SELECT =
  "id, appointment_id, notes, status, started_at, completed_at";

export const FOLLOW_UP_SELECT =
  "id, appointment_id, patient_id, follow_up_type, due_date, instructions, " +
  "set_reminder, new_appointment_required, status, created_at";

/** Embedded to-one relations arrive as an object or a single-item array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface ProfileRow {
  full_name: string | null;
  preferred_name: string | null;
  phone: string | null;
}
interface DoctorRow {
  full_name: string;
  portrait_palette: number | null;
}
interface ServiceRow {
  name: string;
}
interface StaffAppointmentRow {
  id: string;
  reference: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  patient_id: string;
  patient_ref: string | null;
  doctor_id: string;
  patient_notes: string | null;
  patient: ProfileRow | ProfileRow[] | null;
  doctor: DoctorRow | DoctorRow[] | null;
  service: ServiceRow | ServiceRow[] | null;
}

/**
 * Patient display name: preferred name, else full name, else a neutral
 * fallback. Never renders an empty label or a raw id.
 */
export function patientDisplayName(profile: ProfileRow | null): string {
  return profile?.preferred_name?.trim() || profile?.full_name?.trim() || "Patient";
}

export function normalizeStaffAppointment(row: unknown): StaffAppointment {
  const r = row as StaffAppointmentRow;
  const patient = one(r.patient);
  const doctor = one(r.doctor);
  const service = one(r.service);
  return {
    id: r.id,
    reference: r.reference,
    date: r.appointment_date,
    time: r.appointment_time,
    status: r.status as DbAppointmentStatus,
    patientId: r.patient_id,
    patientMfId: r.patient_ref ?? null,
    patientName: patientDisplayName(patient),
    patientPhone: patient?.phone ?? null,
    doctorId: r.doctor_id,
    doctorName: doctor?.full_name ?? "Doctor",
    doctorPalette: doctor?.portrait_palette ?? null,
    serviceName: service?.name ?? null,
    patientNotes: r.patient_notes,
  };
}

export function normalizeStaffAppointments(rows: unknown): StaffAppointment[] {
  return Array.isArray(rows) ? rows.map(normalizeStaffAppointment) : [];
}

interface LookupRow {
  appointment_id: string;
  reference: string;
  patient_ref: string | null;
  patient_name: string;
  patient_phone: string | null;
  doctor_name: string;
  doctor_palette: number | null;
  service_name: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  can_check_in: boolean;
  can_check_out: boolean;
}

export function normalizeLookup(row: unknown): AppointmentLookup | null {
  const r = (Array.isArray(row) ? row[0] : row) as LookupRow | undefined;
  if (!r) return null;
  return {
    appointmentId: r.appointment_id,
    reference: r.reference,
    patientMfId: r.patient_ref ?? null,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    doctorName: r.doctor_name,
    doctorPalette: r.doctor_palette,
    serviceName: r.service_name,
    date: r.appointment_date,
    time: r.appointment_time,
    status: r.status as DbAppointmentStatus,
    canCheckIn: r.can_check_in,
    canCheckOut: r.can_check_out,
  };
}

interface ConsultationRow {
  id: string;
  appointment_id: string;
  notes: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export function normalizeConsultation(row: unknown): Consultation | null {
  const r = (Array.isArray(row) ? row[0] : row) as ConsultationRow | undefined;
  if (!r) return null;
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    notes: r.notes,
    status: r.status === "completed" ? "completed" : "draft",
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

interface FollowUpRow {
  id: string;
  appointment_id: string;
  patient_id: string;
  follow_up_type: string;
  due_date: string;
  instructions: string;
  set_reminder: boolean;
  new_appointment_required: boolean;
  status: string;
  created_at: string;
}

export function normalizeFollowUps(rows: unknown): FollowUp[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row as FollowUpRow;
    return {
      id: r.id,
      appointmentId: r.appointment_id,
      patientId: r.patient_id,
      followUpType: r.follow_up_type as FollowUpType,
      dueDate: r.due_date,
      instructions: r.instructions,
      setReminder: r.set_reminder,
      newAppointmentRequired: r.new_appointment_required,
      status: (r.status === "approved" || r.status === "completed" ? r.status : "draft") as FollowUp["status"],
      createdAt: r.created_at,
    };
  });
}

interface HealthRow {
  allergies: string | null;
  current_medications: string | null;
}

export function normalizeReportedHealth(row: unknown): ReportedHealth | null {
  const r = (Array.isArray(row) ? row[0] : row) as HealthRow | undefined;
  if (!r) return null;
  return { allergies: r.allergies, currentMedications: r.current_medications };
}
