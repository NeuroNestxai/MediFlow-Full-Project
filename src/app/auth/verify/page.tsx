import { PlaceholderScreen } from "@/components/shared/PlaceholderScreen";

// NOTE: This is a placeholder for a possible future one-time-code (OTP)
// verification feature. It is intentionally NOT part of the Patient
// email-and-password journey: Patient sign-up uses an email confirmation
// link handled by /auth/confirm, not a six-digit code. Nothing in the
// Patient flow links here.
export default function VerifyPage() {
  return (
    <PlaceholderScreen
      title="Verify Your Identity"
      backHref="/auth/role-selection"
      backLabel="Back to Role Selection"
    />
  );
}
