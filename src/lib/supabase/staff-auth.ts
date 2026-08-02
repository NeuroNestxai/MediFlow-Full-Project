import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireRole, PERMISSION_DENIED_PATH, SIGN_IN_PATH } from "@/lib/supabase/auth-roles";

/**
 * Server-side context loaders for the two staff roles, mirroring
 * `patient-auth.ts::requirePatient()`.
 *
 * Role comes from public.user_roles via the authenticated (RLS-scoped) client
 * — never from buttons, URL params, localStorage or editable user metadata,
 * and never with a service-role key.
 */

export interface DoctorContext {
  /** public.doctors.id for the signed-in clinician. */
  doctorId: string;
  fullName: string;
  portraitPalette: number | null;
  specialtyNames: string[];
}

export interface ReceptionContext {
  displayName: string;
}

/**
 * Require a signed-in doctor AND a linked `public.doctors` row.
 *
 * An account holding the `doctor` role but not linked to a doctor record can
 * do nothing meaningful (every doctor RPC and policy resolves through
 * `private.current_doctor_id()`), so this denies access rather than rendering
 * a broken, empty dashboard.
 */
export async function requireDoctor(): Promise<DoctorContext> {
  await requireRole("doctor");
  if (!isSupabaseConfigured()) redirect(SIGN_IN_PATH);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { data, error } = await supabase
    .from("doctors")
    .select("id, full_name, portrait_palette, doctor_specialties(specialty:specialties(name))")
    .eq("user_id", user.id)
    .maybeSingle();

  // A blocked read or a missing link is treated as "not verified" → denied.
  if (error || !data) redirect(PERMISSION_DENIED_PATH);

  const row = data as {
    id: string;
    full_name: string;
    portrait_palette: number | null;
    doctor_specialties?: { specialty?: { name: string } | { name: string }[] | null }[] | null;
  };

  const specialtyNames = (row.doctor_specialties ?? [])
    .map((ds) => (Array.isArray(ds.specialty) ? ds.specialty[0] : ds.specialty))
    .map((s) => s?.name)
    .filter((n): n is string => Boolean(n));

  return {
    doctorId: row.id,
    fullName: row.full_name,
    portraitPalette: row.portrait_palette,
    specialtyNames,
  };
}

/**
 * Require a signed-in receptionist. Reception is not tied to a directory
 * record, so only the role is required; the greeting name falls back safely.
 */
export async function requireReception(): Promise<ReceptionContext> {
  await requireRole("reception");
  if (!isSupabaseConfigured()) redirect(SIGN_IN_PATH);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { data } = await supabase
    .from("profiles")
    .select("full_name, preferred_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as { full_name: string | null; preferred_name: string | null } | null;
  const displayName =
    profile?.preferred_name?.trim() ||
    profile?.full_name?.trim().split(/\s+/)[0] ||
    "there";

  return { displayName };
}
