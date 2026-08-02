import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { mockAppointments } from "@/data/mock-appointments";
import { getDoctorById } from "@/data/mock-doctors";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE } from "@/types";
import { requireRole } from "@/lib/supabase/auth-roles";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * Representative screen 3/6 — Doctor Dashboard.
 * Shows the day's schedule with live-update-style status badges and a
 * mock "live updates" feed — all using icon + label + shape per badge,
 * never color alone.
 */
export default async function DoctorDashboardPage() {
  await requireRole("doctor");
  const doctor = getDoctorById("doc-abbas-pakkyara");

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        {doctor ? <DoctorPortrait palette={doctor.portraitPalette} size={56} /> : null}
        <div>
          <h1 className={styles.greeting}>Good day, {doctor?.name ?? "Doctor"}.</h1>
          <p className={styles.subGreeting}>{doctor?.specialty} · Saturday, 26 July 2026</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="Checked In" value={3} hint="Currently at clinic" />
        <StatCard label="Waiting" value={2} hint="In the queue" />
        <StatCard label="In Consultation" value={1} />
        <StatCard label="Completed" value={4} />
      </div>

      <div className={styles.mainRow}>
        <section className={styles.scheduleCol} aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className={styles.sectionTitle}>
            Today&rsquo;s schedule
          </h2>
          <ul className={styles.scheduleList}>
            {mockAppointments.map((appt) => (
              <li key={appt.id} className={styles.scheduleRow}>
                <span className={styles.time}>{appt.time}</span>
                <span className={styles.patientName}>{appt.patientName}</span>
                <StatusBadge
                  tone={APPOINTMENT_STATUS_TONE[appt.status]}
                  label={APPOINTMENT_STATUS_LABEL[appt.status]}
                />
              </li>
            ))}
          </ul>
          <div className={styles.quickActions}>
            <Button variant="secondary">View Today&rsquo;s Schedule</Button>
            <Button variant="secondary">Open Patient List</Button>
          </div>
        </section>

        <section className={styles.liveCol} aria-labelledby="live-heading">
          <h2 id="live-heading" className={styles.sectionTitle}>
            <span className={styles.liveDot} aria-hidden="true" /> Live updates active
          </h2>
          <ul className={styles.liveFeed}>
            <li>Patient booked — Maryam · just now</li>
            <li>Patient checked in — Ahmed · just now</li>
            <li>Patient started — Fatima · just now</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}
