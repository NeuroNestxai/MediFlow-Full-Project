import { useId, type ReactNode } from "react";
import styles from "./FormField.module.css";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (ids: { describedBy?: string }) => ReactNode;
}

/**
 * FormField — pairs a label, an optional hint, and an optional validation
 * error with its control via `aria-describedby`, and announces the error
 * with `role="alert"` so screen readers pick it up immediately without
 * relying on color to signal something went wrong.
 */
export function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  // useId() is required here (not a manual counter) -- it is the only ID
  // strategy React guarantees to match between server render and client
  // hydration, regardless of render order or Strict Mode double-invokes.
  const baseId = useId();
  const hintId = hint ? baseId + "-hint" : undefined;
  const errorId = error ? baseId + "-error" : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
        {required ? (
          <span aria-hidden="true" className={styles.required}>
            {" "}
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children({ describedBy })}
      {hint && !error ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
