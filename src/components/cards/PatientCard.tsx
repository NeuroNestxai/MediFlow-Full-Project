import type { MockPatient } from "@/data/mock-patients";
import { Button } from "@/components/ui/Button";
import styles from "./PatientCard.module.css";

export interface PatientCardProps {
  patient: MockPatient;
  meta?: string;
  onOpen?: () => void;
}

/** Neutral, non-photographic patient representation — respects patient
 * privacy the same way the Figma "Patient Avatar (Neutral)" component does. */
export function PatientCard({ patient, meta, onOpen }: PatientCardProps) {
  return (
    <article className={styles.card}>
      <span className={styles.avatar} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="7.5" r="3.2" />
          <path d="M4 16.5 C5 12.8 7.2 11 10 11 C12.8 11 15 12.8 16 16.5" />
        </svg>
      </span>
      <div className={styles.info}>
        <h3 className={styles.name}>{patient.name}</h3>
        <p className={styles.meta}>
          {patient.preferredName} · {patient.kind}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      <Button variant="secondary" onClick={onOpen}>
        Open
      </Button>
    </article>
  );
}
