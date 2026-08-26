"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { ErrorIcon } from "./Icons";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: traps focus while open, restores focus to the
 * triggering element on close, closes on Escape, sets initial focus on the
 * first focusable control (falling back to the dialog surface itself if it
 * has none), and is labeled via `aria-labelledby`/`aria-describedby` rather
 * than relying on visual styling alone to convey that it is a modal.
 *
 * IDs are generated with `useId()` so multiple Dialogs can exist in the
 * page (or be mounted/unmounted repeatedly) without colliding.
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const titleId = `dialog-title-${reactId}`;
  const descId = `dialog-description-${reactId}`;

  // Keep the latest onClose in a ref rather than the effect's dependency
  // array. If a caller passes a new inline `onClose` on every render (e.g.
  // because the dialog contains a form whose typing triggers a parent
  // re-render), depending on it directly would re-run the effect below on
  // every keystroke — including the "move focus to the first focusable
  // element" line, which visibly steals focus away from whatever the user
  // is typing into. A ref sidesteps that without changing the behaviour.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;

    // Correct initial focus: move focus to the first focusable element
    // inside the dialog (e.g. its close button or first input) rather than
    // leaving focus on the page behind it. Fall back to the dialog surface
    // itself only if it happens to contain no focusable children. This now
    // runs exactly once per open (not on every re-render), since `open` is
    // the only dependency.
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialogRef.current)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Focus restoration: return focus to whatever triggered the dialog.
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton
            icon={<ErrorIcon />}
            aria-label="Close dialog"
            variant="subtle"
            onClick={onClose}
          />
        </div>
        {description ? (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        ) : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
