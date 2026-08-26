import {
  getAuthenticatedRole,
  dashboardPathForRole,
  safeNextPath,
  PERMISSION_DENIED_PATH,
} from "@/lib/supabase/auth-roles";
import { redirect } from "next/navigation";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const nextParam = typeof params.next === "string" ? params.next : undefined;
  const safeNext = safeNextPath(nextParam);

  // Already signed in → straight to the intended destination if there was
  // one (e.g. a QR check-in link), otherwise the dashboard matching the DB role.
  const { userId, role } = await getAuthenticatedRole();
  if (userId) {
    if (safeNext) redirect(safeNext);
    if (role) redirect(dashboardPathForRole(role));
    redirect(PERMISSION_DENIED_PATH);
  }

  const confirmationError = params.error === "confirmation";

  return <SignInForm confirmationError={confirmationError} next={nextParam} />;
}
