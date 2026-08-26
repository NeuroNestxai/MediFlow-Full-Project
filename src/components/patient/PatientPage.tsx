import type { ReactNode } from "react";
import { TourLauncher } from "@/components/tour/TourLauncher";
import type { PageTour } from "@/components/tour/tours";
import styles from "./PatientPage.module.css";

/**
 * Shared Patient page container — one consistent max content width, page
 * padding, and bottom spacing (clearing the mobile bottom nav + safe area).
 * Every Patient page wraps its content in this so spacing/width never drifts
 * page-to-page.
 */
export function PatientPage({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  /** `narrow` for reading/forms, `default` for most lists, `wide` for grids. */
  width?: "narrow" | "default" | "wide";
  className?: string;
}) {
  return (
    <div className={`${styles.page} ${styles[width]} ${className ?? ""}`}>{children}</div>
  );
}

/**
 * Consistent page header: title + optional small muted `meta` line (e.g. the
 * patient's MF ID) + optional description, an optional actions slot, and
 * (when a tour is supplied) the standard "Tour this page" launcher — giving
 * every Patient page the same Help/replay affordance.
 */
export function PatientPageHeader({
  title,
  meta,
  description,
  actions,
  tour,
}: {
  title: string;
  /** A single small muted line directly under the title — kept deliberately
   * quiet, not a card. Used for the patient's MF ID on the dashboard. */
  meta?: string;
  description?: string;
  actions?: ReactNode;
  tour?: PageTour;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headingWrap}>
        <h1 className={styles.title}>{title}</h1>
        {meta ? <p className={styles.meta}>{meta}</p> : null}
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions || tour ? (
        <div className={styles.actions}>
          {actions}
          {tour ? <TourLauncher tour={tour} /> : null}
        </div>
      ) : null}
    </header>
  );
}

/** A titled content section with consistent spacing and heading. */
export function PatientSection({
  title,
  id,
  actions,
  children,
  className,
  tourId,
}: {
  title?: string;
  id?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional data-tour anchor for guided tours. */
  tourId?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      className={`${styles.section} ${className ?? ""}`}
      aria-labelledby={title ? headingId : undefined}
      data-tour={tourId}
    >
      {title ? (
        <div className={styles.sectionHead}>
          <h2 id={headingId} className={styles.sectionTitle}>
            {title}
          </h2>
          {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}