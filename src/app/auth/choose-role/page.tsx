import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  getAuthenticatedRole,
  dashboardPathForRole,
  SIGN_IN_PATH,
  PERMISSION_DENIED_PATH,
  type AppRole,
} from "@/lib/supabase/auth-roles";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your area — MediFlow AI" };

const ROLE_COPY: Record<AppRole, { title: string; body: string }> = {
  patient: {
    title: "Patient",
    body: "Book appointments, view your bookings and check-in code.",
  },
  doctor: {
    title: "Clinician",
    body: "Your schedule, patient summaries, consultations and follow-ups.",
  },
  reception: {
    title: "Reception",
    body: "Check-in and checkout, the live clinic queue, and appointments.",
  },
};

/**
 * Shown after sign-in when an account holds more than one role — at MCC some
 * staff are both a clinician and an administrator. Rather than silently
 * dropping them into whichever role the code listed first, we ask.
 *
 * This is a convenience, not a security boundary: the roles offered are read
 * server-side from public.user_roles, and every destination independently
 * re-checks the role. Picking one grants nothing.
 */
export default async function ChooseRolePage() {
  const { userId, roles } = await getAuthenticatedRole();
  if (!userId) redirect(SIGN_IN_PATH);
  if (roles.length === 0) redirect(PERMISSION_DENIED_PATH);
  // Only one role — there is nothing to choose.
  if (roles.length === 1) redirect(dashboardPathForRole(roles[0]));

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Where would you like to go?</h1>
        <p className={styles.body}>
          Your account has access to more than one area of MediFlow. You can switch at any
          time by returning to this page.
        </p>

        <ul className={styles.list}>
          {roles.map((role) => (
            <li key={role} className={styles.item}>
              <div>
                <h2 className={styles.itemTitle}>{ROLE_COPY[role].title}</h2>
                <p className={styles.itemBody}>{ROLE_COPY[role].body}</p>
              </div>
              <Button variant="primary" href={dashboardPathForRole(role)}>
                Continue
              </Button>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
