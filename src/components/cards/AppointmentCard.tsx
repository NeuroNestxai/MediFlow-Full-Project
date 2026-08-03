import type { Appointment } from "@/types";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE } from "@/types";
import { getDoctorById } from "@/data/mock-doctors";
import { getServiceById } from "@/data/mock-services";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import styles from "./AppointmentCard.module.css";

export interface AppointmentCardProps {
  appointment: Appointment;
  onViewDetails?: () => void;
  onCancel?: () => void;
}

export function AppointmentCard({ appointment, onViewDetails, onCancel }: AppointmentCardProps) {
  const doctor = getDoctorById(appointment.doctorId);
  const service = getServiceById(appointment.serviceId);

  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <div>
          <h3 className={styles.doctorName}>{doctor?.name ?? "Doctor"}</h3>
          <p className={styles.service}>{service?.name ?? "Service"}</p>
        </div>
        <StatusBadge
          tone={APPOINTMENT_STATUS_TONE[appointment.status]}
          label={APPOINTMENT_STATUS_LABEL[appointment.status]}
        />
      </div>
      <div className={styles.meta}>
        <span>{appointment.date}</span>
        <span>{appointment.time}</span>
      </div>
      <p className={styles.ref}>Ref: {appointment.reference}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onViewDetails}>
          View Details
        </Button>
        <Button variant="destructive" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </article>
  );
}
