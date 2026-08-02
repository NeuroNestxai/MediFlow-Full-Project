import { redirect } from "next/navigation";

// Reception accounts do not self-register and use the unified sign-in.
export default function LegacyReceptionSignInPage() {
  redirect("/auth/sign-in");
}
