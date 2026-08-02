import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import styles from "./MobileHeader.module.css";

export interface MobileHeaderProps {
  title: string;
  onBack?: () => void;
  /** Where the logo should return to when there is no Back action — each
   * role passes its own dashboard route so the logo never sends a signed-in
   * user back to the generic role-selection screen. */
  homeHref: string;
}

/** Mobile header — every mobile screen renders this (or a page-level
 * heading) so the current context is always announced, and Back always
 * targets a real, meaningful previous step rather than a generic "close". */
export function MobileHeader({ title, onBack, homeHref }: MobileHeaderProps) {
  return (
    <header className={styles.header}>
      {onBack ? (
        <button className={styles.backButton} onClick={onBack} aria-label="Go back">
          ←
        </button>
      ) : (
        <Link href={homeHref} aria-label="Go to dashboard" className={styles.logoLink}>
          <Logo variant="mark" size={24} />
        </Link>
      )}
      <h1 className={styles.title}>{title}</h1>
      <span className={styles.spacer} aria-hidden="true" />
    </header>
  );
}
