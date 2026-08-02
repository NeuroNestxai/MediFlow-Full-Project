import Link from "next/link";
import styles from "./PlaceholderScreen.module.css";

export interface PlaceholderScreenProps {
  title: string;
  backHref: string;
  backLabel: string;
}

/** Used for routes that exist (so navigation and information architecture
 * are real) but are not fully built out in this implementation stage. */
export function PlaceholderScreen({ title, backHref, backLabel }: PlaceholderScreenProps) {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>
        This screen&rsquo;s route and navigation are wired up, but its full interface has not
        been implemented in this stage yet. It follows in a later implementation pass.
      </p>
      <Link href={backHref} className={styles.link}>
        ← {backLabel}
      </Link>
    </div>
  );
}
