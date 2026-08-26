"use client";

import { HelpIcon } from "@/components/ui/Icons";
import { useTour } from "./TourProvider";
import type { PageTour } from "./tours";
import styles from "./tourLauncher.module.css";

/**
 * "Tour this page" control. Placed consistently on every Patient page so a
 * patient can replay the current page's guidance at any time. Carries the
 * stable data-tour anchor the dashboard tour points at.
 */
export function TourLauncher({ tour, label = "Tour this page" }: { tour: PageTour; label?: string }) {
  const { start } = useTour();
  return (
    <button
      type="button"
      className={styles.launcher}
      onClick={() => start(tour)}
      data-tour="patient-help-tour"
    >
      <HelpIcon aria-hidden="true" className={styles.icon} />
      <span>{label}</span>
    </button>
  );
}
