"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox } from "@/components/ui/Checkbox";
import { useAccessibility } from "./AccessibilityProvider";
import { COLOR_MODES } from "@/types";
import styles from "./AccessibilityLauncher.module.css";

/**
 * Always-available accessibility control.
 *
 * Mounted in the root layout rather than on a settings page, because someone
 * who needs high contrast or larger text needs it *before* they can read the
 * sign-in form — not after they get inside. Preferences are stored per device
 * and apply across the whole app.
 */
export function AccessibilityLauncher() {
  const [open, setOpen] = useState(false);
  const { colorMode, setColorMode, reducedMotion, setReducedMotion, largeText, setLargeText } =
    useAccessibility();

  function resetToDefault() {
    setColorMode("standard");
    setReducedMotion(false);
    setLargeText(false);
  }

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <PersonIcon />
        <span className={styles.launcherLabel}>Accessibility</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Accessibility settings"
        description="These settings apply across MediFlow on this device."
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Colour vision mode</legend>
          <div className={styles.options}>
            {COLOR_MODES.map((mode) => {
              const active = colorMode === mode.value;
              return (
                <label
                  key={mode.value}
                  className={`${styles.option} ${active ? styles.optionActive : ""}`}
                >
                  <input
                    type="radio"
                    name="mediflow-colour-mode"
                    className={styles.radio}
                    value={mode.value}
                    checked={active}
                    onChange={() => setColorMode(mode.value)}
                  />
                  <span className={styles.optionLabel}>{mode.label}</span>
                  {/* Selection is shown by the radio, the label weight AND a
                      tick — never by colour alone. */}
                  <span aria-hidden="true" className={styles.tick}>
                    {active ? "✓" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={styles.toggles}>
          <Checkbox
            label="Reduced motion"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          <Checkbox
            label="Large text"
            checked={largeText}
            onChange={(e) => setLargeText(e.target.checked)}
          />
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.reset} onClick={resetToDefault}>
            Reset to default
          </button>
        </div>
      </Dialog>
    </>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="4" r="2" fill="currentColor" />
      <path
        d="M4 8h16M12 8v6m0 0l-3.5 6M12 14l3.5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
