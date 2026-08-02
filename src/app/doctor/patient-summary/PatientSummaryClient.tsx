"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchAppointmentById, fetchReportedHealth } from "@/lib/staff/client-data";
import type { ReportedHealth, StaffAppointment } from "@/lib/staff/types";
import { DB_STATUS_LABEL, DB_STATUS_TONE, formatDate, formatTime } from "@/lib/patient/types";
import styles from "./page.module.css";

type HealthState =
  | { status: "ready"; health: ReportedHealth | null }
  | { status: "unavailable" }
  | { status: "error" };

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; appointment: StaffAppointment; health: HealthState };

export interface PatientSummaryClientProps {
  appointmentId: string | null;
}

/**
 * Organises information the patient themselves provided at booking. It carries
 * no diagnosis, severity, urgency or triage of any kind, and adds no content
 * that the patient did not write.
 */
export function PatientSummaryClient({ appointmentId }: PatientSummaryClientProps) {
  const [state, setState] = useState<LoadState>(() =>
    appointmentId ? { status: "loading" } : { status: "missing" },
  );
  const [toast, setToast] = useState<{ tone: "error" | "info"; message: string } | null>(null);
  const activeRef = useRef(true);

  const load = useCallback((showSpinner: boolean) => {
    if (!appointmentId) {
      setState({ status: "missing" });
      return;
    }
    if (showSpinner) setState({ status: "loading" });
    fetchAppointmentById(appointmentId)
      .then(async (appointment) => {
        if (!activeRef.current) return;
        if (!appointment) {
          setState({ status: "missing" });
          return;
        }
        const result = await fetchReportedHealth(appointment.patientId);
        if (!activeRef.current) return;
        const health: HealthState =
          result.status === "ready"
            ? { status: "ready", health: result.health }
            : { status: result.status };
        if (result.status === "error") {
          setToast({
            tone: "error",
            message: "Patient-reported health could not be loaded. Nothing was changed.",
          });
        }
        setState({ status: "ready", appointment, health });
      })
      .catch(() => {
        if (activeRef.current) setState({ status: "error" });
      });
  }, [appointmentId]);

  useEffect(() => {
    activeRef.current = true;
    // The initial state already reflects "loading"/"missing", so nothing is
    // set synchronously here — only from the async callbacks inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>AI-Organized Patient Summary</h1>

      <p className={styles.banner} role="note">
        AI-organized summary — doctor review required before clinical use.
      </p>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      {state.status === "loading" && <LoadingState label="Loading patient summary…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "missing" && (
        <EmptyState
          title="No appointment selected"
          body="Open a patient from today's schedule to see the information they provided at booking."
          action={
            <Button variant="primary" href="/doctor/dashboard">
              Back to Dashboard
            </Button>
          }
        />
      )}

      {state.status === "ready" && (
        <SummaryBody appointment={state.appointment} health={state.health} />
      )}
    </div>
  );
}

function SummaryBody({
  appointment,
  health,
}: {
  appointment: StaffAppointment;
  health: HealthState;
}) {
  const notes = appointment.patientNotes?.trim() ?? "";

  return (
    <>
      <section className={styles.card} aria-labelledby="patient-heading">
        <div className={styles.cardTop}>
          <div>
            <h2 id="patient-heading" className={styles.patientName}>
              {appointment.patientName}
            </h2>
            <p className={styles.meta}>
              {appointment.serviceName ?? "Service not recorded"} ·{" "}
              {formatDate(appointment.date)} · {formatTime(appointment.time)}
            </p>
          </div>
          <StatusBadge
            tone={DB_STATUS_TONE[appointment.status]}
            label={DB_STATUS_LABEL[appointment.status]}
          />
        </div>
      </section>

      <Section title="Patient's original message" chip={<SourceLabel source="patient-reported" />}>
        {notes ? (
          <p className={styles.body}>{notes}</p>
        ) : (
          <p className={styles.muted}>No additional notes were provided at booking.</p>
        )}
      </Section>

      <div className={styles.twoCol}>
        <Section title="Allergies" chip={<SourceLabel source="patient-reported" />}>
          <HealthValue health={health} field="allergies" emptyLabel="No allergies were reported." />
        </Section>
        <Section title="Medications" chip={<SourceLabel source="patient-reported" />}>
          <HealthValue
            health={health}
            field="currentMedications"
            emptyLabel="No current medications were reported."
          />
        </Section>
      </div>

      <Section title="Missing information" chip={<SourceLabel source="ai-organized" />}>
        <ul className={styles.list}>
          {notes ? null : <li>No additional notes were provided at booking.</li>}
          {health.status === "ready" && !health.health?.allergies?.trim() ? (
            <li>Allergies were not filled in by the patient.</li>
          ) : null}
          {health.status === "ready" && !health.health?.currentMedications?.trim() ? (
            <li>Current medications were not filled in by the patient.</li>
          ) : null}
          {health.status !== "ready" ? (
            <li>Patient-reported health could not be loaded for this visit.</li>
          ) : null}
          {notes &&
          health.status === "ready" &&
          health.health?.allergies?.trim() &&
          health.health?.currentMedications?.trim() ? (
            <li>The patient completed every field available at booking.</li>
          ) : null}
        </ul>
      </Section>

      <Section title="Booking history" chip={<SourceLabel source="ai-organized" />}>
        <dl className={styles.details}>
          <div className={styles.detailRow}>
            <dt>Reference</dt>
            <dd>{appointment.reference}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Date</dt>
            <dd>{formatDate(appointment.date)}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Time</dt>
            <dd>{formatTime(appointment.time)}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Current status</dt>
            <dd>
              <StatusBadge
                tone={DB_STATUS_TONE[appointment.status]}
                label={DB_STATUS_LABEL[appointment.status]}
              />
            </dd>
          </div>
        </dl>
      </Section>

      <div className={styles.actions}>
        <Button variant="primary" href={`/doctor/consultation?appointment=${appointment.id}`}>
          Start Consultation
        </Button>
        <Button variant="secondary" href="/doctor/dashboard">
          Back to Dashboard
        </Button>
      </div>
    </>
  );
}

function HealthValue({
  health,
  field,
  emptyLabel,
}: {
  health: HealthState;
  field: keyof ReportedHealth;
  emptyLabel: string;
}) {
  if (health.status === "unavailable") {
    return <p className={styles.muted}>Patient-reported health is not available on this account.</p>;
  }
  if (health.status === "error") {
    return <p className={styles.muted}>This could not be loaded right now. Nothing was changed.</p>;
  }
  const value = health.health?.[field]?.trim();
  return value ? <p className={styles.body}>{value}</p> : <p className={styles.muted}>{emptyLabel}</p>;
}

function Section({
  title,
  chip,
  children,
}: {
  title: string;
  chip: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {chip}
      </div>
      {children}
    </section>
  );
}
