"use client";

import { AccessibilityModeSelector } from "@/components/accessibility/AccessibilityModeSelector";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PatientPage, PatientPageHeader, PatientSection } from "@/components/patient/PatientPage";
import { PATIENT_TOURS } from "@/components/tour/tours";
import styles from "./page.module.css";

/**
 * Dedicated accessibility settings page. It reuses the same provider + selector
 * as the global dialog, so changes here apply everywhere and persist on this
 * device. Status is always shown with icon + label + shape, never colour alone.
 */
export function AccessibilityView() {
  const { setColorMode, setReducedMotion, setLargeText } = useAccessibility();

  function resetToDefault() {
    setColorMode("standard");
    setReducedMotion(false);
    setLargeText(false);
  }

  return (
    <PatientPage width="narrow">
      <PatientPageHeader
        title="Accessibility"
        description="These settings apply across MediFlow on this device. Every status uses an icon and a text label, never colour alone."
        tour={PATIENT_TOURS.accessibility}
      />

      <PatientSection>
        <AccessibilityModeSelector colorTourId="a11y-color" togglesTourId="a11y-toggles" />

        <ul className={styles.explain}>
          <li>
            <strong>Colour vision mode</strong> — re-tunes status colours for protanopia,
            deuteranopia, tritanopia, or a high-contrast greyscale.
          </li>
          <li>
            <strong>Large text</strong> — increases text size across the app for easier reading.
          </li>
          <li>
            <strong>Reduced motion</strong> — freezes animations, including the Ask MediFlow sphere
            and thinking indicator.
          </li>
        </ul>

        <div className={styles.resetRow} data-tour="a11y-reset">
          <button type="button" className={styles.reset} onClick={resetToDefault}>
            Reset to default
          </button>
        </div>
      </PatientSection>

      <PatientSection title="Live preview" id="preview">
        <p className={styles.previewHint}>
          These badges use the same components as the rest of the app — switch colour modes above
          and watch them stay readable.
        </p>
        <div className={styles.badgeRow}>
          <StatusBadge tone="success" label="Confirmed" />
          <StatusBadge tone="pending" label="Waiting" />
          <StatusBadge tone="info" label="Info" />
          <StatusBadge tone="error" label="Cancelled" />
          <StatusBadge tone="neutral" label="Neutral" />
        </div>
      </PatientSection>
    </PatientPage>
  );
}
