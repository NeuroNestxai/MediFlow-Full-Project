import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AccessibilityMenu } from "@/components/accessibility/AccessibilityMenu";
import { AppearanceToggle } from "@/components/appearance/AppearanceToggle";
import styles from "./MobileBrandBar.module.css";

/**
 * Slim brand bar shown only on mobile/narrow widths (the desktop top nav is
 * hidden there). Gives every role's mobile screens the approved MediFlow mark
 * — linking to that role's own dashboard — and a labelled accessibility
 * trigger, without otherwise changing the page content below it.
 */
export function MobileBrandBar({ homeHref }: { homeHref: string }) {
  return (
    <header className={styles.bar}>
      <Link href={homeHref} className={styles.logoLink} aria-label="MediFlow AI — go to dashboard">
        <Logo variant="header" size={26} alt="" />
      </Link>
      <div className={styles.actions}>
        <AppearanceToggle variant="icon" />
        <AccessibilityMenu variant="icon" />
      </div>
    </header>
  );
}
