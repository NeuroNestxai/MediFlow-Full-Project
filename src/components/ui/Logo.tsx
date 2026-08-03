"use client";

import { useId } from "react";
import styles from "./Logo.module.css";

interface LogoProps {
  variant?: "mark" | "lockup";
  size?: number;
  className?: string;
}

/**
 * MediFlow logo. Mirrors the Figma "Logo" component set
 * (Type=Mark / Type=Lockup). Text-only wordmark — no final approved
 * logo artwork is embedded here, matching the Figma source of truth.
 *
 * Gradient IDs are generated with `useId()`: DesktopTopNav and MobileHeader
 * both render a Logo instance simultaneously (CSS just hides one per
 * breakpoint, it is never removed from the DOM), so hardcoded gradient IDs
 * would collide across instances on the same page. Each Logo now gets its
 * own unique gradient IDs regardless of how many are mounted at once.
 */
export function Logo({ variant = "lockup", size = 32, className }: LogoProps) {
  const reactId = useId();
  const ringGradientId = `mediflow-ring-${reactId}`;
  const riverGradientId = `mediflow-river-${reactId}`;

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="MediFlow AI"
      className={styles.mark}
    >
      {/* Open ring — the clinic journey, deliberately not closed.
          Circumference is 2π·38 ≈ 239, so "189 50" leaves a ~75° gap; the
          rotation puts that gap at the lower left, where the path flows out. */}
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke={`url(#${ringGradientId})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeDasharray="189 50"
        transform="rotate(-165 50 50)"
      />

      {/* Waypoints along the arc — the steps of a visit. */}
      <circle cx="59.5" cy="13.2" r="4" fill="#2AA9A6" />
      <circle cx="76.6" cy="26.4" r="3.2" fill="#4E7FC1" />
      <circle cx="85.9" cy="44.7" r="2.9" fill="#5A6BB0" />
      <circle cx="84.4" cy="63.6" r="3.2" fill="#7458B0" />
      <circle cx="40" cy="16.6" r="2.9" fill="#3D9BA4" />

      {/* The flowing path — "from symptoms to care". */}
      <path
        d="M56 12 C44 26, 62 34, 55 46 C48 58, 34 62, 33 84"
        fill="none"
        stroke={`url(#${riverGradientId})`}
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* The patient, to the right of the path. */}
      <circle cx="62" cy="57" r="6" fill="none" stroke="#8FA3D8" strokeWidth="2.8" />
      <path
        d="M50 78 C50 67, 74 67, 74 78"
        fill="none"
        stroke="#8FA3D8"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Motion lines at mid-left. */}
      <path
        d="M12 40 H30 M8 48 H26 M16 56 H24"
        stroke="#9BD8D6"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id={ringGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12A9AE" />
          <stop offset="45%" stopColor="#3B4A87" />
          <stop offset="100%" stopColor="#9179C6" />
        </linearGradient>
        {/* Teal at the top (arrival) flowing down to violet (care). */}
        <linearGradient id={riverGradientId} x1="0.4" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#7FCFD0" />
          <stop offset="45%" stopColor="#4E7FC1" />
          <stop offset="100%" stopColor="#2E3A6D" />
        </linearGradient>
      </defs>
    </svg>
  );

  if (variant === "mark") {
    return <span className={className}>{mark}</span>;
  }

  return (
    <span className={`${styles.lockup} ${className ?? ""}`}>
      {mark}
      <span className={styles.wordmark}>MediFlow AI</span>
    </span>
  );
}
