import { AuthShell } from "@/components/auth/AuthShell";
import { LockIcon } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import authStyles from "@/components/auth/authForm.module.css";
import styles from "./page.module.css";

export const metadata = { title: "Access restricted — MediFlow AI" };

/**
 * Shown when an authenticated user without the required role reaches a
 * protected area (e.g. requirePatient() redirects here). Deliberately generic:
 * no role IDs, account IDs, or other private details are revealed.
 */
export default function PermissionDeniedPage() {
  return (
    <AuthShell>
      <div className={styles.icon} aria-hidden="true">
        <LockIcon width={26} height={26} />
      </div>
      <h1 className={authStyles.title}>You don&rsquo;t have access to this area</h1>
      <p className={authStyles.subtitle}>
        This part of MediFlow is for patients. If you think this is a mistake, sign in with a
        patient account.
      </p>
      <div className={authStyles.actions}>
        <Button href="/auth/sign-in" variant="primary" fullWidth>
          Go to Sign In
        </Button>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
