import type { StatusTone } from "@/types";

// ---------------------------------------------------------------------------
// Domain types for the Supabase-backed Patient booking slice.
// ---------------------------------------------------------------------------

export interface Specialty {
  id: string;
  name: string;
}

export interface DirectoryService {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ageGroup: string | null;
  specialtyId: string | null;
  specialtyName: string | null;
}

export interface DoctorServiceRef {
  id: string;
  name: string;
  slug: string;
}

export interface DirectoryDoctor {
  id: string;
  slug: string;
  fullName: string;
  gender: string | null;
  portraitPalette: number | null;
  /** Authoritative specialties from public.doctor_specialties (may be empty,
   * one, or many). doctors.specialty_id is only a legacy fallback flag. */
  specialties: Specialty[];
  /** Approved, active services this doctor offers. Empty ⇒ not bookable. */
  services: DoctorServiceRef[];
}

export type DbAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled";

export interface PatientAppointment {
  id: string;
  reference: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  status: DbAppointmentStatus;
  doctorId: string;
  serviceId: string;
  doctorName: string | null;
  serviceName: string | null;
}

export interface AvailableSlot {
  availabilityId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  isDemo: boolean;
  sourceLabel: string | null;
}

// ---------------------------------------------------------------------------
// Status presentation (operational only — no clinical meaning).
// ---------------------------------------------------------------------------

export const DB_STATUS_LABEL: Record<DbAppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DB_STATUS_TONE: Record<DbAppointmentStatus, StatusTone> = {
  scheduled: "info",
  confirmed: "info",
  checked_in: "success",
  completed: "success",
  cancelled: "error",
};

/** Appointments a patient may still cancel. */
export const CANCELLABLE_STATUSES: DbAppointmentStatus[] = ["scheduled", "confirmed"];

// ---------------------------------------------------------------------------
// Display formatters (dates/times come from the DB as ISO date / HH:MM:SS).
// ---------------------------------------------------------------------------

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(hms: string): string {
  const [hh, mm] = hms.split(":").map(Number);
  if (Number.isNaN(hh)) return hms;
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm ?? 0).padStart(2, "0")} ${period}`;
}

/** Clamp a possibly-out-of-range palette value to the portrait set (1–4). */
export function toPalette(value: number | null | undefined): 1 | 2 | 3 | 4 {
  const n = value ?? 1;
  return (n >= 1 && n <= 4 ? n : 1) as 1 | 2 | 3 | 4;
}

/** Ensure exactly one "Dr." honorific — never doubled when full_name already has it. */
export function displayDoctorName(fullName: string): string {
  const t = (fullName ?? "").trim();
  if (!t) return "Doctor";
  return /^dr\.?\s/i.test(t) ? t : `Dr. ${t}`;
}

/** Concise, page/section-level prototype-mapping notice (never per-chip clutter). */
export const PROTOTYPE_MAPPING_NOTICE = "Prototype service mapping for this demo.";
export const DEMO_AVAILABILITY_NOTICE =
  "Prototype availability — not an official MCC schedule.";
