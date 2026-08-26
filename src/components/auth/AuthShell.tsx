import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { AccessibilityMenu } from "@/components/accessibility/AccessibilityMenu";
import { AppearanceToggle } from "@/components/appearance/AppearanceToggle";
import styles from "./AuthShell.module.css";

/**
 * Shared split-screen shell for every authentication screen (sign in, patient
 * sign up, forgot / reset password, permission denied). The left brand panel
 * and the right form panel are one layout; each page only supplies the form
 * card content as `children`, so spacing, radius, shadow and the accessibility
 * trigger stay identical across all auth routes.
 *
 * This is a presentational shell only — it never touches auth state, never
 * offers a role selector, and does not change which route a form submits to.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {/* Spans the FULL page now, not just the brand panel -- it used to be
          clipped at the brand panel's edge, which read as an abrupt cutoff
          once the background became one continuous gradient across both
          sides. It sits behind the glass card too, so the lines show
          softly through the blur instead of stopping dead before it. */}
      <BrandDecoration />

      <aside className={styles.brand} aria-label="About MediFlow AI">
        <div className={styles.brandGlow} aria-hidden="true" />
        <div className={styles.brandInner}>
          {/* Reverted to the original approved full lockup image per
              request -- the dark-mode box behind the wordmark is a known,
              accepted tradeoff for now. */}
          <Logo variant="full" size={360} className={styles.brandMark} alt="MediFlow AI" priority />
          <p className={styles.brandContext}>MCC Clinic · Patient &amp; staff portal</p>
        </div>
      </aside>

      <div className={styles.panel}>
        <div className={styles.panelBar}>
          {/* Was already planned for every auth screen from the start, but
              never actually got wired in here -- restoring it now,
              alongside Accessibility. */}
          <AppearanceToggle variant="pill" />
          <AccessibilityMenu variant="pill" />
        </div>
        <main className={styles.formArea} id="auth-main">
          <div className={styles.card}>{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Calm, static brand decoration: flowing guide paths + connected nodes in the
 * approved teal/blue/violet palette, now spanning the whole page rather than
 * one narrow panel. No motion, no glow, low contrast. */
function BrandDecoration() {
  return (
    <svg
      className={styles.decoration}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="auth-path" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12A9AE" />
          <stop offset="55%" stopColor="#4A6FB0" />
          <stop offset="100%" stopColor="#9179C6" />
        </linearGradient>
      </defs>
      <path
        className={styles.flowPath1}
        d="M-40 140 C260 210 220 380 480 420 C760 460 820 300 1100 340 C1340 375 1420 520 1660 560"
        fill="none"
        stroke="url(#auth-path)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        className={styles.flowPath2}
        d="M-40 340 C280 400 300 560 560 600 C820 640 880 500 1160 540 C1380 570 1460 700 1660 730"
        fill="none"
        stroke="url(#auth-path)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        className={styles.flowPath3}
        d="M100 700 C340 660 420 780 640 760 C900 736 940 830 1180 810"
        fill="none"
        stroke="url(#auth-path)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.35"
      />
      <g fill="url(#auth-path)">
        <circle cx="160" cy="180" r="6" />
        <circle cx="480" cy="420" r="8" />
        <circle cx="700" cy="440" r="5" />
        <circle cx="900" cy="330" r="5" />
        <circle cx="1100" cy="340" r="7" />
        <circle cx="1340" cy="420" r="5" />
        <circle cx="1500" cy="500" r="6" />
        <circle cx="300" cy="380" r="4" opacity="0.6" />
        <circle cx="820" cy="600" r="6" opacity="0.6" />
        <circle cx="1160" cy="540" r="5" opacity="0.6" />
        <circle cx="1440" cy="650" r="6" opacity="0.6" />
      </g>
    </svg>
  );
}
