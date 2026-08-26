import type { ComponentType } from "react";
import type { StatusTone } from "@/types";
import { describeStatus } from "@/lib/a11y";
import { CheckIcon, ClockIcon, InfoIcon, ErrorIcon, BellIcon } from "./Icons";
import styles from "./StatusBadge.module.css";

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

const TONE_ICON: Record<StatusTone, ComponentType<{ className?: string }>> = {
  success: CheckIcon,
  pending: ClockIcon,
  info: InfoIcon,
  error: ErrorIcon,
  neutral: BellIcon,
};

/**
 * StatusBadge — mirrors the Figma "Status Badge" component set.
 *
 * Accessibility rule (non-negotiable, carried from the Figma file):
 * status is communicated through an icon AND a text label AND a distinct
 * shape (the error tone uses a dashed border) — never color alone. This
 * is what keeps every status readable in the Achromatopsia / Grayscale
 * High Contrast mode.
 */
export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`${styles.badge} ${styles[tone]}`}
      role="status"
      aria-label={describeStatus(tone, label)}
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <span>{label}</span>
    </span>
  );
}
