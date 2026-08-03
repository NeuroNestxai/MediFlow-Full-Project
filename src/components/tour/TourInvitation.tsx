"use client";

import { useState } from "react";
import { useTour } from "./TourProvider";
import type { PageTour } from "./tours";
import styles from "./tourLauncher.module.css";

/**
 * Small, non-blocking first-visit invitation (dashboard). It never forces the
 * tour: "Maybe later" hides it for now, "Don't show again" persists the
 * preference. Only shown until the patient has completed this tour or opted out.
 */
export function TourInvitation({ tour }: { tour: PageTour }) {
  const { start, isCompleted, inviteDismissed, dismissInvite } = useTour();
  const [hiddenForNow, setHiddenForNow] = useState(false);

  if (hiddenForNow || inviteDismissed || isCompleted(tour)) return null;

  return (
    <div className={styles.invite} role="region" aria-label="Guided tour invitation">
      <p className={styles.inviteText}>Would you like a quick tour of MediFlow?</p>
      <div className={styles.inviteActions}>
        <button type="button" className={styles.inviteStart} onClick={() => start(tour)}>
          Start Tour
        </button>
        <button type="button" className={styles.inviteGhost} onClick={() => setHiddenForNow(true)}>
          Maybe Later
        </button>
        <button type="button" className={styles.inviteGhost} onClick={dismissInvite}>
          Don&rsquo;t Show Again
        </button>
      </div>
    </div>
  );
}
