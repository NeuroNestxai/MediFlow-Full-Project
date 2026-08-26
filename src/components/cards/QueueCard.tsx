import type { QueueEntry } from "@/types";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import styles from "./QueueCard.module.css";

export interface QueueCardProps {
  entry: QueueEntry;
  onMove?: () => void;
  onSend?: () => void;
}

export function QueueCard({ entry, onMove, onSend }: QueueCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.info}>
        <h3 className={styles.name}>{entry.patientName}</h3>
        <p className={styles.meta}>
          {entry.doctorName} · {entry.time}
        </p>
      </div>
      <StatusBadge
        tone={APPOINTMENT_STATUS_TONE[entry.status]}
        label={APPOINTMENT_STATUS_LABEL[entry.status]}
      />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onMove}>
          Move
        </Button>
        <Button variant="secondary" onClick={onSend}>
          Send
        </Button>
      </div>
    </article>
  );
}
