import type { StatusTone } from "@/types";
import { CheckIcon, ErrorIcon, InfoIcon } from "./Icons";
import styles from "./Toast.module.css";

export interface ToastProps {
  tone: Extract<StatusTone, "success" | "error" | "info">;
  message: string;
  onDismiss?: () => void;
}

const TONE_ICON = { success: CheckIcon, error: ErrorIcon, info: InfoIcon };

/** Toast — uses `role="status"`/`aria-live="polite"` (assertive for errors)
 * so screen reader users hear the message without it stealing focus. */
export function Toast({ tone, message, onDismiss }: ToastProps) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={`${styles.toast} ${styles[tone]}`}
      role="status"
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <span className={styles.message}>{message}</span>
      {onDismiss ? (
        <button className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss notification">
          ×
        </button>
      ) : null}
    </div>
  );
}
