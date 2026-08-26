"use client";

import { CheckIcon, ErrorIcon } from "@/components/ui/Icons";
import styles from "./PasswordStrengthMeter.module.css";

interface Requirement {
  key: string;
  label: string;
  met: (password: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { key: "length", label: "At least 8 characters", met: (p) => p.length >= 8 },
  { key: "upper", label: "At least one uppercase letter", met: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "At least one lowercase letter", met: (p) => /[a-z]/.test(p) },
  { key: "symbol", label: "At least one special character (# @ % $ ...)", met: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Red cross / green check per requirement -- colour is still never the
 * only signal here, since the icon shape itself (check vs. cross) and the
 * text both change too, not just colour.
 *
 * Two states only: while anything is still missing, the checklist shows
 * exactly what's left, each line red or green on its own. The moment
 * every requirement is met, the whole checklist disappears and a single
 * green "Strong password" line takes its place -- guidance while it's
 * needed, gone the instant it isn't.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const allMet = REQUIREMENTS.every((r) => r.met(password));

  if (allMet) {
    return (
      <p className={styles.strengthLabel} aria-live="polite">
        <CheckIcon aria-hidden="true" width={13} height={13} className={styles.strengthIcon} />
        Strong password
      </p>
    );
  }

  return (
    <ul className={styles.checklist} aria-live="polite">
      {REQUIREMENTS.map((r) => {
        const met = r.met(password);
        return (
          <li key={r.key} className={`${styles.item} ${met ? styles.itemMet : styles.itemUnmet}`}>
            {met ? (
              <CheckIcon aria-hidden="true" width={13} height={13} className={styles.itemIcon} />
            ) : (
              <ErrorIcon aria-hidden="true" width={13} height={13} className={styles.itemIcon} />
            )}
            <span>
              {r.label}
              <span className="sr-only">{met ? " -- met" : " -- not yet met"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
