import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Unified, server-side role resolution. The role is ALWAYS read from
 * public.user_roles via the authenticated (RLS-scoped) client — never from
 * buttons, URL params, localStorage, editable metadata, or client state, and
 * never with a service-role key.
 */
export type AppRole = "patient" | "doctor" | "reception";

export const APP_ROLES: AppRole[] = ["patient", "doctor", "reception"];
export const SIGN_IN_PATH = "/auth/sign-in";
export const PERMISSION_DENIED_PATH = "/auth/permission-denied";
export const POST_LOGIN_PATH = "/auth/post-login";

const DASHBOARD_FOR_ROLE: Record<AppRole, string> = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  reception: "/reception/dashboard",
};

export function dashboardPathForRole(role: AppRole): string {
  return DASHBOARD_FOR_ROLE[role];
}

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as string[]).includes(value);
}

/**
 * Reads the signed-in user's role from public.user_roles.
 * - `userId` is null when there is no session.
 * - `role` is null when the user has no known/valid role, or the read is
 *   blocked (treated as "not verified").
 * Never throws; never exposes IDs/tokens/errors to callers.
 */
export async function getAuthenticatedRole(): Promise<{
  userId: string | null;
  role: AppRole | null;
}> {
  if (!isSupabaseConfigured()) return { userId: null, role: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null };

  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (error) return { userId: user.id, role: null };

  const roles = (data ?? []).map((r) => String((r as { role: unknown }).role));
  const known = APP_ROLES.find((r) => roles.includes(r)) ?? null;
  return { userId: user.id, role: known };
}

/** Ensure a signed-in user; redirect to the shared sign-in otherwise. */
export async function requireAuthenticatedUser(): Promise<string> {
  if (!isSupabaseConfigured()) redirect(SIGN_IN_PATH);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user.id;
}

/**
 * Require the signed-in user to hold exactly `expected`. Signed-out → sign-in;
 * wrong/missing/blocked role → permission-denied. No IDs/errors exposed.
 */
export async function requireRole(expected: AppRole): Promise<void> {
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) redirect(SIGN_IN_PATH);
  if (role !== expected) redirect(PERMISSION_DENIED_PATH);
}

/**
 * Send an authenticated user to the dashboard matching their DB role. If they
 * have no valid role → permission-denied. If signed out → sign-in. Used by the
 * shared sign-in page and the post-login handoff.
 */
export async function redirectAuthenticatedUserByRole(): Promise<void> {
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) redirect(SIGN_IN_PATH);
  if (!role) redirect(PERMISSION_DENIED_PATH);
  redirect(dashboardPathForRole(role));
}
