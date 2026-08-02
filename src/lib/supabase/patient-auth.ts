import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** The subset of `public.profiles` this stage reads for the signed-in user. */
export interface PatientProfile {
  full_name: string | null;
  preferred_name: string | null;
  phone: string | null;
}

export interface AuthenticatedPatient {
  /** Email comes from the authenticated Supabase user, not from profiles. */
  email: string | null;
  /** Own profile row, or null when it doesn't exist / couldn't be read. */
  profile: PatientProfile | null;
  /** True when RLS (or any error) prevented reading the profile row. */
  profileBlocked: boolean;
}

/**
 * Securely loads the authenticated patient using the server-side Supabase
 * client and the caller's own RLS-scoped access.
 *
 * - Verifies there is a signed-in user (redirects to sign-in otherwise).
 * - Confirms the user has the `patient` role in `public.user_roles`; anything
 *   else (missing role, non-patient, or a blocked role read) denies access and
 *   redirects to the permission-denied screen — without exposing IDs or errors.
 * - Reads only the current user's `public.profiles` row.
 *
 * Uses the normal authenticated client and existing RLS — never a service-role
 * key, and never bypassing policies.
 */
export async function requirePatient(): Promise<AuthenticatedPatient> {
  if (!isSupabaseConfigured()) {
    redirect("/auth/sign-in");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in");
  }

  // Role verification — read only this user's role rows.
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  // A blocked/failed role read is treated as "not verified" → deny access.
  if (roleError) {
    redirect("/auth/permission-denied");
  }

  const isPatient = (roles ?? []).some((row) => row.role === "patient");
  if (!isPatient) {
    redirect("/auth/permission-denied");
  }

  // Read only the current user's profile row.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, preferred_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return {
    email: user.email ?? null,
    profile: profileError ? null : (profile as PatientProfile | null),
    profileBlocked: Boolean(profileError),
  };
}

/**
 * Resolves the greeting name per the product rule: preferred name, else the
 * first word of the full name, else `null` (callers show a generic greeting).
 */
export function resolveGreetingName(profile: PatientProfile | null): string | null {
  const preferred = profile?.preferred_name?.trim();
  if (preferred) return preferred;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  return firstName ? firstName : null;
}
