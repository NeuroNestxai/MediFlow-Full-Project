import { StatePanel } from "@/components/states/StatePanel";
import { LockIcon } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import styles from "./page.module.css";

export const metadata = { title: "Access restricted — MediFlow AI" };

/**
 * Shown when an authenticated user without the required role reaches a
 * protected area (e.g. requirePatient() redirects here). Deliberately generic:
 * no role IDs, account IDs, or other private details are revealed.
 */
export default function PermissionDeniedPage() {
  return (
    <main className={styles.page}>
      <StatePanel
        icon={<LockIcon />}
        title="You don't have access to this area"
        body="This part of MediFlow is for patients. If you think this is a mistake, sign in with a patient account."
        action={
          <div className={styles.actions}>
            <Button href="/auth/sign-in" variant="primary">
              Go to Sign In
            </Button>
            <SignOutButton />
          </div>
        }
      />
    </main>
  );
}
