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
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke={`url(#${ringGradientId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="215 30"
      />
      <path
        d="M29 37 C21 51 33 57 28 67"
        fill="none"
        stroke={`url(#${riverGradientId})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id={ringGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12A9AE" />
          <stop offset="55%" stopColor="#3B4A87" />
          <stop offset="100%" stopColor="#9179C6" />
        </linearGradient>
        <linearGradient id={riverGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9179C6" />
          <stop offset="100%" stopColor="#3B4A87" />
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
