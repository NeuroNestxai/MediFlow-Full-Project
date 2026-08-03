import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import styles from "./page.module.css";

export const metadata = { title: "Welcome — MediFlow AI" };

/**
 * Informational landing only. Everyone signs in through the single shared
 * /auth/sign-in; the correct role dashboard is resolved server-side from
 * public.user_roles after authentication. This page never selects a role or
 * bypasses authentication. Doctors and reception staff do not self-register —
 * their accounts are provisioned by an administrator.
 */
export default function RoleSelectionPage() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <Logo variant="header" size={46} />
        <p className={styles.tagline}>INQUIRY · DOCTOR · APPOINTMENT</p>
      </div>

      <h1 className={styles.title}>Welcome to MediFlow</h1>
      <p className={styles.subtitle}>
        MCC Clinic&rsquo;s connected platform for patients, doctors, and clinic operations. Sign in
        with your account — you&rsquo;ll be taken to the right place automatically.
      </p>

      <div className={styles.cards}>
        <InfoCard
          kicker="PATIENTS"
          title="Find care, book, and stay informed"
          description="Find MCC services, choose a doctor, book appointments, and manage your visit."
        />
        <InfoCard
          kicker="DOCTORS"
          title="Your schedule, patients, and follow-ups"
          description="Review your schedule, patient summaries, consultations, and follow-ups. Accounts are provisioned by an administrator."
        />
        <InfoCard
          kicker="RECEPTION / ADMIN"
          title="Run the clinic's daily operations"
          description="Manage appointments, arrivals, live queues, check-in, and checkout. Accounts are provisioned by an administrator."
        />
      </div>

      <div className={styles.demoBar}>
        <div>
          <h2 className={styles.demoTitle}>Ready to continue?</h2>
          <p className={styles.demoSubtitle}>
            Everyone signs in here. New patients can create an account.
          </p>
        </div>
        <div className={styles.demoButtons}>
          <Button href="/auth/sign-in" variant="primary">
            Sign In
          </Button>
          <Button href="/auth/patient/sign-up" variant="secondary">
            Create Patient Account
          </Button>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <section className={styles.card} aria-labelledby={`${kicker}-title`}>
      <p className={styles.kicker}>{kicker}</p>
      <h3 id={`${kicker}-title`} className={styles.cardTitle}>
        {title}
      </h3>
      <p className={styles.cardDescription}>{description}</p>
    </section>
  );
}
