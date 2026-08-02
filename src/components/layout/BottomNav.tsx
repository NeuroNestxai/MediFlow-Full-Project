import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./BottomNav.module.css";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

interface BottomNavProps {
  items: BottomNavItem[];
  activeHref: string;
  /** Accessible name distinguishing this role's nav from the other two —
   * important since a user could conceivably have multiple role tabs open. */
  navLabel: string;
}

/** Base bottom navigation. Each role gets its own wrapper below with its
 * own fixed item set, so the correct nav (and only the correct nav) ever
 * renders for that role's screens. */
export function BottomNav({ items, activeHref, navLabel }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label={navLabel}>
      {items.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${isActive ? styles.active : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
