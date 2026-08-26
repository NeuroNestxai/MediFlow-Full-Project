import { redirect } from "next/navigation";

// Doctor accounts do not self-register and use the unified sign-in.
export default function LegacyDoctorSignInPage() {
  redirect("/auth/sign-in");
}
