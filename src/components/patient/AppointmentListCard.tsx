import type { PatientAppointment } from "@/lib/patient/types";
import { DB_STATUS_LABEL, DB_STATUS_TONE, formatDate, formatTime } from "@/lib/patient/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import styles from "@/components/cards/AppointmentCard.module.css";

export interface AppointmentListCardProps {
  appointment: PatientAppointment;
  onViewDetails?: () => void;
  onCancel?: () => void;
  onReschedule?: () => void;
  cancellable?: boolean;
  reschedulable?: boolean;
  /** When set, a "Show QR" action links here (only for QR-active visits). */
  qrHref?: string;
}

/** Supabase-backed appointment card showing the real server reference. */
export function AppointmentListCard({
  appointment,
  onViewDetails,
  onCancel,
  onReschedule,
  cancellable,
  reschedulable,
  qrHref,
}: AppointmentListCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <div>
          <h3 className={styles.doctorName}>{appointment.doctorName ?? "Doctor"}</h3>
          <p className={styles.service}>{appointment.serviceName ?? "Service"}</p>
        </div>
        <StatusBadge
          tone={DB_STATUS_TONE[appointment.status]}
          label={DB_STATUS_LABEL[appointment.status]}
        />
      </div>
      <div className={styles.meta}>
        <span>{formatDate(appointment.date)}</span>
        <span>{formatTime(appointment.time)}</span>
      </div>
      <p className={styles.ref}>Booking reference: {appointment.reference}</p>
      <div className={styles.actions}>
        {onViewDetails ? (
          <Button variant="secondary" onClick={onViewDetails}>
            View Details
          </Button>
        ) : null}
        {qrHref ? (
          <Button variant="secondary" href={qrHref}>
            Show QR
          </Button>
        ) : null}
        {reschedulable && onReschedule ? (
          <Button variant="secondary" onClick={onReschedule}>
            Reschedule
          </Button>
        ) : null}
        {cancellable && onCancel ? (
          <Button variant="destructive" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </article>
  );
}
