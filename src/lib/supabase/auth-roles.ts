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
export const CHOOSE_ROLE_PATH = "/auth/choose-role";

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
 * Only a same-site relative path is ever honored as a post-login
 * destination -- e.g. `/reception/qr-scan?ref=REF-2026-000001` is fine,
 * but `//evil.com` or `https://evil.com` is rejected outright. This is
 * what stops a crafted `next` value from turning a login link into an
 * open redirect. Note this only decides where a signed-in user is SENT --
 * the actual role check for that destination still happens in
 * middleware.ts on the request that follows, so an invalid-but-clever
 * `next` here can never grant access to an area the user doesn't hold.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null;
  return value;
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
  /**
   * EVERY role the user holds. A person can legitimately hold more than one —
   * at MCC, Dr. Nadia Al Hajri is both a clinician and an administrator — so
   * access must be decided by membership of this list, never by `role` alone.
   */
  roles: AppRole[];
}> {
  if (!isSupabaseConfigured()) return { userId: null, role: null, roles: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null, roles: [] };

  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (error) return { userId: user.id, role: null, roles: [] };

  const raw = (data ?? []).map((r) => String((r as { role: unknown }).role));
  const roles = APP_ROLES.filter((r) => raw.includes(r));
  // `role` stays the single "primary" role, used only to pick a default
  // landing page. It is NOT an access decision.
  return { userId: user.id, role: roles[0] ?? null, roles };
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
  const { userId, roles } = await getAuthenticatedRole();
  if (!userId) redirect(SIGN_IN_PATH);
  // Membership, not equality: a user who holds both `doctor` and `reception`
  // must be able to reach both areas. Comparing against a single resolved role
  // would silently lock them out of one of their own jobs.
  if (!roles.includes(expected)) redirect(PERMISSION_DENIED_PATH);
}

/**
 * Send an authenticated user to the dashboard matching their DB role. If they
 * have no valid role → permission-denied. If signed out → sign-in. Used by the
 * shared sign-in page and the post-login handoff.
 */
export async function redirectAuthenticatedUserByRole(next?: string | null): Promise<void> {
  const { userId, role, roles } = await getAuthenticatedRole();
  if (!userId) redirect(SIGN_IN_PATH);
  if (!role) redirect(PERMISSION_DENIED_PATH);
  // A specific destination (e.g. from a QR check-in link) always wins over
  // the generic dashboard/choose-role hand-off -- someone who scanned a
  // link had somewhere specific to be, not a generic "which hat am I
  // wearing today" decision to make.
  const safeNext = safeNextPath(next);
  if (safeNext) redirect(safeNext);
  // Someone who wears two hats is asked which one they are here for, rather
  // than being dropped into whichever the code happened to list first.
  if (roles.length > 1) redirect(CHOOSE_ROLE_PATH);
  redirect(dashboardPathForRole(role));
}
