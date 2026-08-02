import { createClient } from "@/lib/supabase/server";
import type { DirectoryDoctor, PatientAppointment } from "./types";
import {
  DOCTOR_SELECT,
  APPOINTMENT_SELECT,
  normalizeDoctor,
  normalizeAppointment,
} from "./normalize";

// Server-side reads for detail pages. Uses the authenticated server client
// (cookies) under existing RLS. Returns null on absence; throws only on a real
// transport failure (callers turn that into a safe state).

/** Load one active doctor (RLS hides inactive). Returns null if not found. */
export async function getDoctorById(id: string): Promise<DirectoryDoctor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .select(DOCTOR_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("doctor_load_failed");
  if (!data) return null;
  return normalizeDoctor(data);
}

/** Load one of the caller's own appointments by reference (RLS-scoped). */
export async function getAppointmentByReference(
  reference: string,
): Promise<PatientAppointment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error("appointment_load_failed");
  if (!data) return null;
  return normalizeAppointment(data);
}
