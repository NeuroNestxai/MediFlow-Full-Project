"use client";

import { COLOR_MODES } from "@/types";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import { CheckIcon } from "@/components/ui/Icons";
import { Checkbox } from "@/components/ui/Checkbox";
import styles from "./AccessibilityModeSelector.module.css";

/**
 * Lets a user switch the app's color-vision mode and toggle reduced
 * motion / large text. Mirrors the Figma "Accessibility Settings" screen.
 * Uses a real radiogroup semantic (fieldset/legend + radio inputs) so the
 * choice — and which one is active — is available to assistive tech,
 * not just conveyed by a highlighted background color.
 */
export function AccessibilityModeSelector() {
  const { colorMode, setColorMode, reducedMotion, setReducedMotion, largeText, setLargeText } =
    useAccessibility();

  return (
    <div className={styles.wrapper}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Color vision mode</legend>
        <div className={styles.options}>
          {COLOR_MODES.map((mode) => {
            const isActive = colorMode === mode.value;
            return (
              <label key={mode.value} className={`${styles.option} ${isActive ? styles.active : ""}`}>
                <input
                  type="radio"
                  name="color-mode"
                  value={mode.value}
                  checked={isActive}
                  onChange={() => setColorMode(mode.value)}
                  className={styles.radioInput}
                />
                <span>{mode.label}</span>
                {isActive ? <CheckIcon aria-hidden="true" className={styles.check} /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.toggleRow}>
        <Checkbox
          id="reduced-motion"
          label="Reduced motion"
          checked={reducedMotion}
          onChange={(e) => setReducedMotion(e.target.checked)}
        />
      </div>
      <div className={styles.toggleRow}>
        <Checkbox
          id="large-text"
          label="Large text"
          checked={largeText}
          onChange={(e) => setLargeText(e.target.checked)}
        />
      </div>
    </div>
  );
}
