import Link from "next/link";
import styles from "./authForm.module.css";

/**
 * Segmented navigation between the two entry points. These are real links to
 * the existing separate routes — never a client tab that changes what the form
 * authorises. Role is always resolved server-side after sign-in.
 */
export function AuthTabs({ active }: { active: "sign-in" | "sign-up" }) {
  return (
    <nav className={styles.tabs} aria-label="Account access">
      <Link
        href="/auth/sign-in"
        className={`${styles.tab} ${active === "sign-in" ? styles.tabActive : ""}`}
        aria-current={active === "sign-in" ? "page" : undefined}
      >
        Sign in
      </Link>
      <Link
        href="/auth/patient/sign-up"
        className={`${styles.tab} ${active === "sign-up" ? styles.tabActive : ""}`}
        aria-current={active === "sign-up" ? "page" : undefined}
      >
        Create account
      </Link>
    </nav>
  );
}
