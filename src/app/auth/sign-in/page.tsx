import { getAuthenticatedRole, dashboardPathForRole, PERMISSION_DENIED_PATH } from "@/lib/supabase/auth-roles";
import { redirect } from "next/navigation";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Already signed in → straight to the dashboard matching the DB role.
  const { userId, role } = await getAuthenticatedRole();
  if (userId) {
    if (role) redirect(dashboardPathForRole(role));
    redirect(PERMISSION_DENIED_PATH);
  }

  const params = await searchParams;
  const confirmationError = params.error === "confirmation";

  return <SignInForm confirmationError={confirmationError} />;
}
