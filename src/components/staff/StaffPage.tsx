import type { ReactNode } from "react";
import styles from "./StaffPage.module.css";

/**
 * Shared page shell for Doctor + Reception screens. Mirrors the quality of the
 * patient PatientPage (semantic tokens, dark-mode aware, Large-Text friendly)
 * so the staff roles use the same MediFlow design language. Presentational only.
 */
export function StaffPage({
  width = "default",
  children,
}: {
  width?: "default" | "wide";
  children: ReactNode;
}) {
  return <div className={`${styles.page} ${width === "wide" ? styles.wide : ""}`}>{children}</div>;
}

export function StaffPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headText}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
