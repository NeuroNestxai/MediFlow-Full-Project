import type { InfoSource } from "@/types";
import styles from "./SourceLabel.module.css";

const SOURCE_TEXT: Record<InfoSource, string> = {
  "patient-reported": "Patient-reported",
  "ai-organized": "AI-organized",
  "doctor-approved": "Doctor-approved",
  "prototype-data": "Prototype data",
};

export interface SourceLabelProps {
  source: InfoSource;
}

/** Mirrors the Figma "Source Label" component set. Every piece of
 * information that isn't a confirmed MCC fact carries one of these, so
 * patients (and, on the Doctor side, clinicians) always know where a
 * detail came from. */
export function SourceLabel({ source }: SourceLabelProps) {
  return <span className={`${styles.label} ${styles[source]}`}>{SOURCE_TEXT[source].toUpperCase()}</span>;
}
