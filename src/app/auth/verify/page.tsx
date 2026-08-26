import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { VerifyForm } from "./VerifyForm";

// Reads cookies to check the session — render per request, never statically.
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  // Already signed in → straight to the dashboard.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/auth/post-login");
    }
  }

  const { email } = await searchParams;
  // This screen only makes sense arriving from sign-up, which always
  // includes the email. Without it there's nothing to verify against.
  if (!email) {
    redirect("/auth/patient/sign-up");
  }

  return <VerifyForm email={email} />;
}
