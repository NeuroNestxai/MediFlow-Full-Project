"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { AccessibilityModeSelector } from "./AccessibilityModeSelector";
import { useAccessibility } from "./AccessibilityProvider";
import { AccessibilityIcon } from "@/components/ui/Icons";
import styles from "./AccessibilityMenu.module.css";

interface AccessibilityMenuProps {
  /** `pill` shows the icon + "Accessibility" text; `icon` is icon-only
   * (still fully labelled for assistive tech). Use `icon` where space is
   * tight, e.g. a mobile header. */
  variant?: "pill" | "icon";
  className?: string;
}

/**
 * Global accessibility control. The trigger opens an accessible Dialog
 * (focus trap, Escape to close, focus returned to the trigger on close — all
 * provided by <Dialog/>) containing the shared colour-vision / text / motion
 * settings plus a reset. State lives in AccessibilityProvider and persists to
 * localStorage, so this works identically on public/auth pages (before login)
 * and inside every role once signed in.
 */
export function AccessibilityMenu({ variant = "pill", className }: AccessibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const { setColorMode, setReducedMotion, setLargeText } = useAccessibility();

  function resetToDefault() {
    setColorMode("standard");
    setReducedMotion(false);
    setLargeText(false);
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${variant === "icon" ? styles.iconOnly : styles.pill} ${className ?? ""}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Accessibility settings"
        title="Accessibility settings"
      >
        <AccessibilityIcon aria-hidden="true" className={styles.icon} />
        {variant === "pill" ? <span className={styles.label}>Accessibility</span> : null}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Accessibility settings"
        description="These settings apply across MediFlow on this device."
      >
        <AccessibilityModeSelector />
        <div className={styles.footer}>
          <button type="button" className={styles.reset} onClick={resetToDefault}>
            Reset to default
          </button>
        </div>
      </Dialog>
    </>
  );
}
