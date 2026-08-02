import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/states/StatePanel";
import { formatDate, formatTime, DB_STATUS_LABEL } from "@/lib/patient/types";
import type { PatientAppointment } from "@/lib/patient/types";
import styles from "./page.module.css";

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
      <div className={styles.page}>
        <h1 className={styles.title}>Check-in code</h1>
        <EmptyState
          title={failed ? "We couldn't load this booking" : "No booking found"}
          body="Open a booking from My Appointments to see its check-in code."
          action={
            <Button variant="primary" href="/patient/appointments">
              Go to My Appointments
            </Button>
          }
        />
      </div>
    );
  }

  const active = qrSvg !== null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Your check-in QR code</h1>

      {active ? (
        <>
          <div
            className={styles.qrCard}
            role="img"
            aria-label={`QR code for clinic check-in. It contains only your booking reference, ${appointment.reference}.`}
            dangerouslySetInnerHTML={{ __html: qrSvg! }}
          />
          <p className={styles.meta}>
            Scan this at reception to check in. The code contains only your booking reference — no
            name, contact, doctor, service, date, or health information.
          </p>
        </>
      ) : (
        <div className={styles.qrCard} role="status">
          <p className={styles.meta}>
            This booking is {DB_STATUS_LABEL[appointment.status].toLowerCase()}, so an active
            check-in code isn&rsquo;t available. Your booking reference is kept for your records
            below.
          </p>
        </div>
      )}

      <p className={styles.meta}>
        {formatDate(appointment.date)} · {formatTime(appointment.time)} ·{" "}
        {DB_STATUS_LABEL[appointment.status]}
      </p>
      <p className={styles.ref}>Booking / check-in reference: {appointment.reference}</p>
      <Button variant="secondary" href="/patient/appointments">
        Back to Appointments
      </Button>
    </div>
  );
}
