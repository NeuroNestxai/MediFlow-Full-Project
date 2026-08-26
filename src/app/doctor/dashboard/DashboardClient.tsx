"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchStaffAppointments, subscribeToAppointments } from "@/lib/staff/client-data";
import { IN_CLINIC_STATUSES, type StaffAppointment } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatTime,
  toPalette,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import { localToday, formatLongDate } from "@/lib/staff/dates";
import styles from "./page.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[] };

const CONSULT_READY: DbAppointmentStatus[] = ["checked_in", "waiting"];

export interface DashboardClientProps {
  fullName: string;
  portraitPalette: number | null;
  specialtyNames: string[];
}

export function DashboardClient({ fullName, portraitPalette, specialtyNames }: DashboardClientProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const today = useMemo(() => localToday(), []);
  const activeRef = useRef(true);

  const load = useCallback(
    (showSpinner: boolean) => {
      if (showSpinner) setState({ status: "loading" });
      fetchStaffAppointments({ date: today })
        .then((appointments) => {
          if (activeRef.current) setState({ status: "ready", appointments });
        })
        .catch(() => {
          if (activeRef.current) setState({ status: "error" });
        });
    },
    [today],
  );

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    const unsubscribe = subscribeToAppointments(() => load(false));
    return () => {
      activeRef.current = false;
      unsubscribe();
    };
  }, [load]);

  const appointments = useMemo(
    () => (state.status === "ready" ? state.appointments : []),
    [state],
  );

  const counts = useMemo(() => {
    const byStatus = (s: DbAppointmentStatus) => appointments.filter((a) => a.status === s).length;
    return {
      checkedIn: byStatus("checked_in"),
      waiting: byStatus("waiting"),
      inConsultation: byStatus("in_consultation"),
      completed: byStatus("completed"),
    };
  }, [appointments]);

  const inClinic = useMemo(
    () => appointments.filter((a) => IN_CLINIC_STATUSES.includes(a.status)),
    [appointments],
  );

  const specialty = specialtyNames.length > 0 ? specialtyNames.join(" - ") : "Clinician";

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headLeft}>
          <DoctorPortrait palette={toPalette(portraitPalette)} size={56} />
          <div>
            <h1 className={styles.greeting}>Good day, {displayDoctorName(fullName)}.</h1>
            <p className={styles.subGreeting}>
              {specialty} - {formatLongDate(today)}
            </p>
          </div>
        </div>
        <div className={styles.headActions}>
          <Button variant="secondary" href="/doctor/appointments">
            View All Appointments
          </Button>
          <Button variant="secondary" href="/doctor/patients">
            Open Patient List
          </Button>
          <Button variant="secondary" href="/doctor/availability">
            Manage Availability
          </Button>
          <Button variant="secondary" href="/doctor/consultation-notes">
            Consultation Notes
          </Button>
          <Button variant="secondary" href="/doctor/notifications">
            Notifications
          </Button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="Checked In" value={counts.checkedIn} hint="Currently at clinic" href="/doctor/appointments?status=checked_in" />
        <StatCard label="Waiting" value={counts.waiting} hint="In the queue" href="/doctor/appointments?status=waiting" />
        <StatCard label="In Consultation" value={counts.inConsultation} hint="Right now" href="/doctor/appointments?status=in_consultation" />
        <StatCard label="Completed" value={counts.completed} hint="Today" href="/doctor/appointments?status=completed" />
      </div>

      <div className={styles.mainRow}>
        <section className={styles.scheduleCol} aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className={styles.sectionTitle}>
            Today's schedule
          </h2>

          {state.status === "loading" && <LoadingState label="Loading today's schedule..." />}
          {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
          {state.status === "ready" && appointments.length === 0 && (
            <EmptyState
              title="No appointments today"
              body="When reception books or checks a patient in, they appear here automatically."
            />
          )}

          {state.status === "ready" && appointments.length > 0 && (
            <ul className={styles.scheduleList}>
              {appointments.map((appt) => (
                <li key={appt.id} className={styles.scheduleRow}>
                  <span className={styles.time}>{formatTime(appt.time)}</span>
                  <Link
                    href={`/doctor/patient-summary?appointment=${appt.id}`}
                    className={styles.patientLink}
                  >
                    {appt.patientName}
                  </Link>
                  <span className={styles.mfId}>{appt.patientMfId ?? "-"}</span>
                  <StatusBadge
                    tone={DB_STATUS_TONE[appt.status]}
                    label={DB_STATUS_LABEL[appt.status]}
                  />
                  {CONSULT_READY.includes(appt.status) ? (
                    <Button
                      variant="primary"
                      href={`/doctor/consultation?appointment=${appt.id}`}
                      className={styles.rowAction}
                    >
                      Start Consultation
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.liveCol} aria-labelledby="live-heading">
          <h2 id="live-heading" className={styles.sectionTitle}>
            <span className={styles.liveDot} aria-hidden="true" /> Live updates active
          </h2>
          <div className={styles.liveFeed} aria-live="polite">
            <p className={styles.liveHint}>
              This list refreshes on its own as reception checks patients in.
            </p>
            {inClinic.length === 0 ? (
              <p className={styles.liveEmpty}>No patients are in the clinic right now.</p>
            ) : (
              <ul className={styles.liveList}>
                {inClinic.map((appt) => (
                  <li key={appt.id} className={styles.liveItem}>
                    <span className={styles.liveName}>{appt.patientName}</span>
                    <span className={styles.mfId}>{appt.patientMfId ?? "-"}</span>
                    <StatusBadge
                      tone={DB_STATUS_TONE[appt.status]}
                      label={DB_STATUS_LABEL[appt.status]}
                    />
                    <span className={styles.liveMeta}>{formatTime(appt.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
}) {
  const content = (
    <>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={styles.statCard}>
        {content}
      </Link>
    );
  }
  return <div className={styles.statCard}>{content}</div>;
}