import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import styles from "./AuthShell.module.css";

/**
 * Split-screen shell for the sign-in and sign-up screens: the MediFlow brand
 * on one side, the form on the other.
 *
 * The two tabs are real links, not client state, so each view keeps its own
 * server component — and with it the "already signed in → go to your
 * dashboard" redirect that runs before anything renders.
 */
export function AuthShell({
  active,
  children,
}: {
  active: "sign-in" | "create-account";
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.brand} aria-hidden="true">
        <div className={styles.brandInner}>
          <Logo variant="mark" size={260} className={styles.brandMark} />
          <h2 className={styles.brandName}>MediFlow AI</h2>
          <p className={styles.tagline}>Guiding you from symptoms to care.</p>
          <p className={styles.brandBody}>
            A secure MCC Clinic platform that helps patients explore services, find doctors,
            manage appointments, and stay connected throughout their clinic journey.
          </p>
          <span className={styles.chip}>MCC Clinic · Patient &amp; staff portal</span>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          {/* Visible only on narrow screens, where the brand panel is hidden. */}
          <div className={styles.compactBrand}>
            <Logo variant="lockup" size={30} />
          </div>

          <nav className={styles.tabs} aria-label="Account">
            <Link
              href="/auth/sign-in"
              className={`${styles.tab} ${active === "sign-in" ? styles.tabActive : ""}`}
              aria-current={active === "sign-in" ? "page" : undefined}
            >
              Sign in
            </Link>
            <Link
              href="/auth/patient/sign-up"
              className={`${styles.tab} ${active === "create-account" ? styles.tabActive : ""}`}
              aria-current={active === "create-account" ? "page" : undefined}
            >
              Create account
            </Link>
          </nav>

          {children}
        </div>
      </section>
    </main>
  );
}
