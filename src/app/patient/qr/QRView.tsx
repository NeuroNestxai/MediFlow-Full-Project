import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/states/StatePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InfoIcon } from "@/components/ui/Icons";
import { PatientPage } from "@/components/patient/PatientPage";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { PATIENT_TOURS } from "@/components/tour/tours";
import {
  formatDate,
  formatTime,
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
} from "@/lib/patient/types";
import type { PatientAppointment, DbAppointmentStatus } from "@/lib/patient/types";
import styles from "./page.module.css";

const STAGES: { label: string; statuses: DbAppointmentStatus[] }[] = [
  { label: "Booked", statuses: ["scheduled", "confirmed"] },
  { label: "Checked in", statuses: ["checked_in"] },
  { label: "In consultation", statuses: ["waiting", "in_consultation"] },
  { label: "Completed", statuses: ["completed"] },
  { label: "Checked out", statuses: ["checked_out"] },
];

function stageIndex(status: DbAppointmentStatus): number {
  const i = STAGES.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}

export function QRView({
  appointment,
  failed,
  qrSvg,
}: {
  appointment: PatientAppointment | null;
  failed?: boolean;
  qrSvg: string | null;
}) {
  if (failed || !appointment) {
    return (
      <PatientPage width="narrow">
        <EmptyState
          icon={<InfoIcon />}
          title={failed ? "We couldn't load this booking" : "No booking found"}
          body="Open a booking from My Appointments to see its check-in code."
          action={
            <Button variant="primary" href="/patient/appointments">
              Go to My Appointments
            </Button>
          }
        />
      </PatientPage>
    );
  }

  const active = qrSvg !== null;
  const ended = appointment.status === "cancelled" || appointment.status === "no_show";
  const current = stageIndex(appointment.status);

  return (
    <PatientPage width="narrow">
      <div className={styles.topBar}>
        <Button variant="tertiary" href="/patient/appointments">
          ← Back to Appointments
        </Button>
        <TourLauncher tour={PATIENT_TOURS.qr} />
      </div>

      <div className={styles.card}>
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>Appointment details</h1>
            <p className={styles.doctor}>
              {appointment.doctorName ? displayDoctorName(appointment.doctorName) : "Doctor"}
            </p>
            <p className={styles.meta}>{appointment.serviceName ?? "Service"}</p>
          </div>
          <StatusBadge
            tone={DB_STATUS_TONE[appointment.status]}
            label={DB_STATUS_LABEL[appointment.status]}
          />
        </div>

        <dl className={styles.details}>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(appointment.date)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatTime(appointment.time)}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{appointment.reference}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.card} data-tour="qr-code">
        <h2 className={styles.sectionTitle}>Check-in QR</h2>
        {active ? (
          <>
            <div
              className={styles.qrCode}
              role="img"
              aria-label={`QR code for clinic check-in. It contains only your booking reference, ${appointment.reference}.`}
              // Safe: this SVG is generated server-side by the qrcode library
              // from the booking reference only — it is not user/n8n content.
              dangerouslySetInnerHTML={{ __html: qrSvg! }}
            />
            <p className={styles.privacy}>
              The QR contains <strong>only your booking reference</strong>. It does not contain your
              medical or personal information. Scan it at reception to check in.
            </p>
          </>
        ) : (
          <p className={styles.meta} role="status">
            This booking is {DB_STATUS_LABEL[appointment.status].toLowerCase()}, so an active
            check-in code isn&rsquo;t available. Your reference is kept above for your records.
          </p>
        )}
      </div>

      <div className={styles.card} data-tour="qr-timeline">
        <h2 className={styles.sectionTitle}>Status</h2>
        {ended ? (
          <p className={styles.meta}>
            This appointment was {DB_STATUS_LABEL[appointment.status].toLowerCase()}.
          </p>
        ) : (
          <ol className={styles.timeline}>
            {STAGES.map((stage, i) => {
              const stateLabel = i < current ? "Done" : i === current ? "Current" : "Upcoming";
              const cls =
                i < current ? styles.done : i === current ? styles.currentStep : styles.upcoming;
              return (
                <li key={stage.label} className={`${styles.step} ${cls}`}>
                  <span className={styles.marker} aria-hidden="true">
                    {i < current ? "✓" : i === current ? "●" : "○"}
                  </span>
                  <span className={styles.stepLabel}>{stage.label}</span>
                  <span className={styles.stepState}>{stateLabel}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PatientPage>
  );
}
