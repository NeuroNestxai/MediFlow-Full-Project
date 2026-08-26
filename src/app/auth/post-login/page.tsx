import { redirectAuthenticatedUserByRole } from "@/lib/supabase/auth-roles";

export const dynamic = "force-dynamic";

/**
 * Neutral hand-off after sign-in / confirmation / password reset. It reads the
 * role server-side and redirects to the matching dashboard (or permission-denied
 * / sign-in) -- or, if `next` was carried through from sign-in (e.g. someone
 * scanned a QR check-in link before they were signed in), sends them there
 * instead. It always redirects, so it renders nothing.
 */
export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  await redirectAuthenticatedUserByRole(next);
  return null;
}
