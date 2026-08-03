"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAppearance, type Appearance } from "./AppearanceProvider";
import styles from "./AppearanceToggle.module.css";

interface AppearanceToggleProps {
  /** `pill` shows a rounded icon button; `icon` is a bare icon button for tight
   *  spaces (e.g. the mobile brand bar). Both are fully labelled. */
  variant?: "pill" | "icon";
  className?: string;
}

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Use device setting" },
];

/**
 * Compact appearance control shown beside the Accessibility button. Opens a
 * small menu with Light / Dark / Use device setting. The selection persists
 * (AppearanceProvider → localStorage) and "Use device setting" follows
 * prefers-color-scheme. The trigger icon reflects the currently applied theme.
 */
export function AppearanceToggle({ variant = "pill", className }: AppearanceToggleProps) {
  const { appearance, setAppearance, theme } = useAppearance();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${variant === "icon" ? styles.iconOnly : styles.pill} ${className ?? ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Appearance"
        title="Appearance"
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>

      {open ? (
        <div className={styles.menu} id={menuId} role="menu" aria-label="Appearance">
          {OPTIONS.map((opt) => {
            const active = appearance === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
                onClick={() => {
                  setAppearance(opt.value);
                  setOpen(false);
                }}
              >
                <span aria-hidden="true" className={styles.itemIcon}>
                  {opt.value === "light" ? <SunIcon /> : opt.value === "dark" ? <MoonIcon /> : <DeviceIcon />}
                </span>
                <span>{opt.label}</span>
                {active ? <CheckMark /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* --- Inline icons (not in the shared Icons set) --- */
function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DeviceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CheckMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={styles.check}
    >
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
