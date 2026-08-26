import type { PatientAppointment } from "@/lib/patient/types";
import { DB_STATUS_LABEL, DB_STATUS_TONE, formatDate, formatTime } from "@/lib/patient/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import styles from "@/components/cards/AppointmentCard.module.css";

/** Statuses "move earlier" opt-in is offered for -- matches what
 * patient_set_wants_earlier itself accepts server-side. */
const WANTS_EARLIER_ELIGIBLE = ["pending_approval", "scheduled", "confirmed"];

export interface AppointmentListCardProps {
  appointment: PatientAppointment;
  onViewDetails?: () => void;
  onCancel?: () => void;
  onReschedule?: () => void;
  cancellable?: boolean;
  reschedulable?: boolean;
  /** When set, a "Show QR" action links here (only for QR-active visits). */
  qrHref?: string;
  /** When set, shows the "notify me of an earlier slot" opt-in checkbox. */
  onToggleWantsEarlier?: (next: boolean) => void;
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
  onToggleWantsEarlier,
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
      {onToggleWantsEarlier && WANTS_EARLIER_ELIGIBLE.includes(appointment.status) ? (
        <Checkbox
          id={`wants-earlier-${appointment.id}`}
          label="Notify me if an earlier slot with this doctor opens up"
          checked={appointment.wantsEarlier}
          onChange={(e) => onToggleWantsEarlier(e.target.checked)}
        />
      ) : null}
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
