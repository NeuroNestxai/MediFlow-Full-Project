"use client";

import { AccessibilityModeSelector } from "@/components/accessibility/AccessibilityModeSelector";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import styles from "./page.module.css";

/**
 * Representative screen 6/6 — Accessibility-mode demonstration.
 * Lets you switch between all 5 color-vision modes live and see, right
 * on this page, that every status badge stays readable via icon + label
 * + shape — never color alone.
 */
export function AccessibilityView() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Accessibility</h1>
      <p className={styles.subtitle}>
        These settings apply across MediFlow. Every status always uses an icon and a text
        label, never color alone — switch modes below and check the preview underneath.
      </p>

      <AccessibilityModeSelector />

      <section className={styles.preview} aria-labelledby="preview-heading">
        <h2 id="preview-heading" className={styles.previewTitle}>
          Live preview
        </h2>
        <p className={styles.previewHint}>
          These badges use the same components as the rest of the app — switch color modes
          above and watch them update immediately.
        </p>
        <div className={styles.badgeRow}>
          <StatusBadge tone="success" label="Confirmed" />
          <StatusBadge tone="pending" label="Waiting" />
          <StatusBadge tone="info" label="Info" />
          <StatusBadge tone="error" label="Cancelled" />
          <StatusBadge tone="neutral" label="Neutral" />
        </div>
      </section>

      <Button href="/patient/profile" variant="secondary">
        Back to Profile
      </Button>
    </div>
  );
}
