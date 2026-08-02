import { QueueCard } from "@/components/cards/QueueCard";
import { Button } from "@/components/ui/Button";
import { mockQueue } from "@/data/mock-notifications";
import { requireRole } from "@/lib/supabase/auth-roles";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * Representative screen 4/6 — Reception Dashboard.
 * Shows operational stats, next arrivals, and a live-queue-style feed
 * using the shared QueueCard (icon/label/shape status, never color alone).
 */
export default async function ReceptionDashboardPage() {
  await requireRole("reception");
  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.greeting}>Good day, Salma.</h1>
          <p className={styles.subGreeting}>Here&rsquo;s today&rsquo;s MCC clinic activity · Saturday, 26 July 2026</p>
        </div>
        <div className={styles.headActions}>
          <Button variant="primary">Scan QR</Button>
          <Button variant="secondary">Open Live Queue</Button>
          <Button variant="secondary">Create Appointment</Button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="Today's Appointments" value={18} />
        <StatCard label="Checked In" value={4} />
        <StatCard label="Waiting" value={3} />
        <StatCard label="Ready for Checkout" value={2} />
      </div>

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className={styles.sectionTitle}>
          Live clinic queue
        </h2>
        <div className={styles.queueList}>
          {mockQueue.map((entry) => (
            <QueueCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
