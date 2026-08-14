import type { StatusTone } from "@/types";
import type { DbAppointmentStatus } from "@/lib/patient/types";

// ---------------------------------------------------------------------------
// Domain types for the Supabase-backed Doctor + Reception workflows.
//
// Mirrors the conventions in `@/lib/patient/types`: DB snake_case is mapped to
// camelCase at the normalize boundary, statuses are operational only, and no
// diagnosis / severity / urgency / triage concept exists anywhere here.
// ---------------------------------------------------------------------------

/** One appointment as staff see it. Reception gets all; a doctor gets theirs. */
export interface StaffAppointment {
  id: string;
  reference: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  status: DbAppointmentStatus;
  patientId: string;
  /** Stable MediFlow patient ID (e.g. MF412300). Safe, non-PII — the only
   * patient identifier the AI is ever given. Sourced from appointments.patient_ref. */
  patientMfId: string | null;
  patientName: string;
  patientPhone: string | null;
  doctorId: string;
  doctorName: string;
  doctorPalette: number | null;
  serviceName: string | null;
  /** Free-text reason the patient gave at booking. Patient-reported, never clinical. */
  patientNotes: string | null;
}

/** Result of a QR scan or manual booking-reference lookup at reception. */
export interface AppointmentLookup {
  appointmentId: string;
  reference: string;
  /** Stable MediFlow patient ID (e.g. MF412300); non-PII. */
  patientMfId: string | null;
  patientName: string;
  patientPhone: string | null;
  doctorName: string;
  doctorPalette: number | null;
  serviceName: string;
  date: string;
  time: string;
  status: DbAppointmentStatus;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

/** Patient-reported health, shown to the treating doctor only. */
export interface ReportedHealth {
  allergies: string | null;
  currentMedications: string | null;
}

export interface Consultation {
  id: string;
  appointmentId: string;
  notes: string | null;
  status: "draft" | "completed";
  startedAt: string;
  completedAt: string | null;
}

export type FollowUpType = "recheck" | "test_review" | "medication_review" | "general_check_in";

export interface FollowUp {
  id: string;
  appointmentId: string;
  patientId: string;
  followUpType: FollowUpType;
  dueDate: string;
  instructions: string;
  setReminder: boolean;
  newAppointmentRequired: boolean;
  status: "draft" | "approved" | "completed";
  createdAt: string;
}

export const FOLLOW_UP_TYPE_LABEL: Record<FollowUpType, string> = {
  recheck: "Recheck",
  test_review: "Test review",
  medication_review: "Medication review",
  general_check_in: "General check-in",
};

// ---------------------------------------------------------------------------
// Operational groupings used by the dashboards and the live queue.
// ---------------------------------------------------------------------------

/** Statuses that mean the patient is physically in the clinic right now. */
export const IN_CLINIC_STATUSES: DbAppointmentStatus[] = [
  "checked_in",
  "waiting",
  "in_consultation",
];

/** Completed but not yet checked out — Reception's "Ready for Checkout" list. */
export function isReadyForCheckout(status: DbAppointmentStatus): boolean {
  return status === "completed";
}

/** Appointments a doctor may open a consultation on. */
export const CONSULTABLE_STATUSES: DbAppointmentStatus[] = [
  "checked_in",
  "waiting",
  "in_consultation",
];

/**
 * Canonical activity timeline shown on the Appointment Details screens.
 * Rendered with the reached steps filled — text + icon + shape, never colour
 * alone (the app-wide accessibility rule).
 */
export const LIFECYCLE_STEPS: { status: DbAppointmentStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "checked_in", label: "Checked In" },
  { status: "waiting", label: "Waiting" },
  { status: "in_consultation", label: "In Consultation" },
  { status: "completed", label: "Consultation Completed" },
  { status: "checked_out", label: "Checked Out" },
];

/** How far along the lifecycle a status sits; -1 for the branch statuses. */
export function lifecycleIndex(status: DbAppointmentStatus): number {
  if (status === "scheduled") return 0;
  return LIFECYCLE_STEPS.findIndex((s) => s.status === status);
}

export const BRANCH_STATUSES: DbAppointmentStatus[] = ["cancelled", "no_show"];

/** Tone for a queue row, reusing the shared status tone vocabulary. */
export const QUEUE_TONE: Record<string, StatusTone> = {
  checked_in: "success",
  waiting: "pending",
  in_consultation: "info",
  completed: "success",
  checked_out: "neutral",
};

/** Shown wherever demo scheduling data is displayed, per the honesty rule. */
export const PROTOTYPE_SCHEDULE_NOTICE =
  "Prototype schedule — demo doctor hours, not official MCC data.";
