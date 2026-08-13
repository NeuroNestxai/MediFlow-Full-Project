import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { AccessibilityMenu } from "@/components/accessibility/AccessibilityMenu";
import { AppearanceToggle } from "@/components/appearance/AppearanceToggle";
import { TourProvider } from "@/components/tour/TourProvider";
import { TourLauncher } from "@/components/tour/TourLauncher";
import type { PageTour } from "@/components/tour/tours";
import styles from "./AuthShell.module.css";

/**
 * Shared split-screen shell for every authentication screen (sign in, patient
 * sign up, forgot / reset password, permission denied). The left brand panel
 * and the right form panel are one layout; each page only supplies the form
 * card content as `children`, so spacing, radius, shadow and the appearance +
 * accessibility + tour triggers stay identical across all auth routes.
 *
 * This is a presentational shell only — it never touches auth state, never
 * offers a role selector, and does not change which route a form submits to.
 */

const AUTH_TOUR: PageTour = {
  id: "auth",
  version: 1,
  title: "Getting in",
  steps: [
    {
      target: "auth-card",
      title: "Sign in or sign up",
      body: "Returning users sign in here. New patients can switch to Create account using the tabs at the top of this card.",
      placement: "left",
    },
    {
      target: "auth-controls",
      title: "Comfort controls",
      body: "Switch light or dark, and open accessibility options, from here — on every screen.",
      placement: "bottom",
    },
  ],
};

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <TourProvider>
      <div className={styles.shell}>
        <aside className={styles.brand} aria-label="About MediFlow AI">
          <BrandDecoration />
          <div className={styles.brandInner}>
            <Logo variant="icon" size={128} className={styles.brandMark} alt="" priority />
            <p className={styles.brandName}>MediFlow AI</p>
            <p className={styles.brandTagline}>Guiding you from symptoms to care.</p>
            <p className={styles.brandDescription}>
              A secure MCC Clinic platform that helps patients explore services, find doctors,
              manage appointments, and stay connected throughout their clinic journey.
            </p>
            <p className={styles.brandContext}>MCC Clinic · Patient &amp; staff portal</p>
          </div>
        </aside>

        <div className={styles.panel}>
          <div className={styles.panelBar} data-tour="auth-controls">
            <AppearanceToggle variant="pill" />
            <AccessibilityMenu variant="pill" />
            <TourLauncher tour={AUTH_TOUR} />
          </div>
          <main className={styles.formArea} id="auth-main">
            <div className={styles.card} data-tour="auth-card">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TourProvider>
  );
}

/** Calm, static brand decoration: flowing guide paths + connected nodes in the
 * approved teal/blue/violet palette. No motion, no glow, low contrast. */
function BrandDecoration() {
  return (
    <svg
      className={styles.decoration}
      viewBox="0 0 400 600"
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
        d="M-20 90 C120 140 90 250 200 300 C310 350 280 470 420 500"
        fill="none"
        stroke="url(#auth-path)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M-20 200 C140 250 120 360 240 400 C340 434 340 520 440 540"
        fill="none"
        stroke="url(#auth-path)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <g fill="url(#auth-path)">
        <circle cx="80" cy="118" r="6" />
        <circle cx="200" cy="300" r="8" />
        <circle cx="286" cy="360" r="5" />
        <circle cx="330" cy="150" r="5" />
        <circle cx="120" cy="470" r="6" />
        <circle cx="360" cy="470" r="7" />
      </g>
    </svg>
  );
}
