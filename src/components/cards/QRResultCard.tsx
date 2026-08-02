import type { StatusTone } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import styles from "./QRResultCard.module.css";

export type QRResultKind = "valid" | "invalid" | "expired" | "already-checked-in";

const RESULT_CONFIG: Record<
  QRResultKind,
  { tone: StatusTone; label: string; title: string; body: string }
> = {
  valid: {
    tone: "success",
    label: "Success",
    title: "QR code verified",
    body: "This appointment reference is valid and ready to check in.",
  },
  invalid: {
    tone: "error",
    label: "Error",
    title: "QR code not recognized",
    body: "This code does not match an MCC appointment.",
  },
  expired: {
    tone: "error",
    label: "Error",
    title: "QR code expired",
    body: "This appointment window has passed.",
  },
  "already-checked-in": {
    tone: "pending",
    label: "Pending",
    title: "Already checked in",
    body: "This patient was already checked in earlier today.",
  },
};

export interface QRResultCardProps {
  kind: QRResultKind;
  patientName?: string;
}

/** Mirrors the Figma "QR Result" component set. Readable at a glance:
 * large title text, generous spacing, and status conveyed by icon + label
 * + text (never the QR graphic's color alone). */
export function QRResultCard({ kind, patientName }: QRResultCardProps) {
  const config = RESULT_CONFIG[kind];
  return (
    <div className={styles.card}>
      <StatusBadge tone={config.tone} label={config.label} />
      {patientName ? <h3 className={styles.patientName}>{patientName}</h3> : null}
      <h3 className={styles.title}>{config.title}</h3>
      <p className={styles.body}>{config.body}</p>
    </div>
  );
}
