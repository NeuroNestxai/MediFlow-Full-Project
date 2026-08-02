import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Legacy role-specific login → unified /auth/sign-in (forwarding only the safe
// confirmation flag; never an arbitrary return path).
export default async function LegacyPatientSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(error === "confirmation" ? "/auth/sign-in?error=confirmation" : "/auth/sign-in");
}
