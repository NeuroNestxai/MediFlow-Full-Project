import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AccessibilityMenu } from "@/components/accessibility/AccessibilityMenu";
import styles from "./DesktopTopNav.module.css";

export interface NavLinkItem {
  href: string;
  label: string;
}

export interface DesktopTopNavProps {
  links: NavLinkItem[];
  activeHref: string;
  roleTag?: string;
  /** Where the logo should return to. Each role layout passes its own
   * dashboard route here — the logo should never send a signed-in Patient,
   * Doctor, or Reception user back to the generic role-selection screen. */
  homeHref: string;
}

/** Desktop/tablet top navigation, shared shape across all three roles.
 * Uses a real <nav> landmark and marks the current page with
 * `aria-current="page"` instead of color alone. */
export function DesktopTopNav({ links, activeHref, roleTag, homeHref }: DesktopTopNavProps) {
  return (
    <header className={styles.header}>
      <Link href={homeHref} className={styles.logoLink} aria-label="MediFlow AI — go to dashboard">
        <Logo variant="header" size={32} alt="" />
      </Link>
      <nav aria-label="Primary" className={styles.nav}>
        {links.map((link) => {
          const isActive = link.href === activeHref;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${isActive ? styles.active : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.rightCluster}>
        {roleTag ? <span className={styles.roleTag}>{roleTag}</span> : null}
        <AccessibilityMenu variant="pill" />
      </div>
    </header>
  );
}
