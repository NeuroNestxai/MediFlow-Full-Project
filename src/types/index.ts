// MediFlow AI — shared types
// Mock-data-only stage: these mirror the shape data will eventually take
// once Supabase is connected, but nothing here is persisted.

export type Role = "patient" | "doctor" | "reception";

export type ColorMode =
  | "standard"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

export const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: "standard", label: "Standard vision" },
  { value: "protanopia", label: "Protanopia" },
  { value: "deuteranopia", label: "Deuteranopia" },
  { value: "tritanopia", label: "Tritanopia" },
  { value: "achromatopsia", label: "Achromatopsia / Grayscale high contrast" },
];

/**
 * Appointment status. Intentionally operational only — no medical
 * severity, urgency, or triage concepts belong on this type.
 */
export type AppointmentStatus =
  | "confirmed"
  | "checked-in"
  | "waiting"
  | "in-consultation"
  | "completed"
  | "checked-out"
  | "cancelled"
  | "rescheduled"
  | "no-show";

export type StatusTone = "success" | "pending" | "info" | "error" | "neutral";

export const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  confirmed: "info",
  "checked-in": "success",
  waiting: "pending",
  "in-consultation": "info",
  completed: "success",
  "checked-out": "success",
  cancelled: "error",
  rescheduled: "pending",
  "no-show": "error",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  "checked-in": "Checked In",
  waiting: "Waiting",
  "in-consultation": "In Consultation",
  completed: "Completed",
  "checked-out": "Checked Out",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  "no-show": "No Show",
};

/** Where a piece of information displayed to a doctor originated. */
export type InfoSource =
  | "patient-reported"
  | "ai-organized"
  | "doctor-approved"
  | "prototype-data";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  gender: "Male" | "Female";
  services: string[];
  portraitPalette: 1 | 2 | 3 | 4;
  nextAvailable: string;
  availability: "Available" | "With Patient" | "Fully Booked";
}

export interface Service {
  id: string;
  name: string;
  specialty: string;
  ageGroup: string;
  description: string;
}

export interface Appointment {
  id: string;
  reference: string;
  patientName: string;
  preferredName: string;
  doctorId: string;
  serviceId: string;
  date: string;
  time: string;
  status: AppointmentStatus;
}

export interface PatientSummaryItem {
  id: string;
  title: string;
  body: string;
  source: InfoSource;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface QueueEntry {
  id: string;
  patientName: string;
  doctorName: string;
  time: string;
  status: AppointmentStatus;
}

/** Generic shared system-state kind, mirroring the Figma State Panel set. */
export type SystemStateKind =
  | "loading"
  | "empty"
  | "success"
  | "validation-error"
  | "error"
  | "offline"
  | "permission-denied"
  | "session-expired";
