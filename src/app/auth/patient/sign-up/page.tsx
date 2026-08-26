import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SignUpForm } from "./SignUpForm";

// Reads cookies to check the session — render per request, never statically.
export const dynamic = "force-dynamic";

export default async function PatientSignUpPage() {
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

  return <SignUpForm />;
}
