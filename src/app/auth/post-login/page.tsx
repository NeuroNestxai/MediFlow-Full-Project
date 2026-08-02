import { redirectAuthenticatedUserByRole } from "@/lib/supabase/auth-roles";

export const dynamic = "force-dynamic";

/**
 * Neutral hand-off after sign-in / confirmation / password reset. It reads the
 * role server-side and redirects to the matching dashboard (or permission-denied
 * / sign-in). It always redirects, so it renders nothing.
 */
export default async function PostLoginPage() {
  await redirectAuthenticatedUserByRole();
  return null;
}
