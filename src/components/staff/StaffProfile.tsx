import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { AccessibilityMenu } from "@/components/accessibility/AccessibilityMenu";
import { AppearanceToggle } from "@/components/appearance/AppearanceToggle";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { toPalette } from "@/lib/patient/types";
import styles from "./StaffProfile.module.css";

/**
 * Shared Doctor/Reception profile + settings. Shows the identity the backend
 * already holds (no invented qualifications, licences or photos), plus the
 * app-wide Accessibility and Appearance controls and Sign Out. Presentational.
 */
export function StaffProfile({
  name,
  roleLabel,
  portraitPalette = null,
  details = [],
}: {
  name: string;
  roleLabel: string;
  portraitPalette?: number | null;
  details?: { label: string; value: string }[];
}) {
  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-labelledby="identity-heading">
        <div className={styles.identity}>
          <DoctorPortrait palette={toPalette(portraitPalette)} size={64} />
          <div>
            <h2 id="identity-heading" className={styles.name}>
              {name}
            </h2>
            <p className={styles.role}>{roleLabel}</p>
          </div>
        </div>
        {details.length > 0 ? (
          <dl className={styles.details}>
            {details.map((d) => (
              <div key={d.label} className={styles.detailRow}>
                <dt className={styles.detailLabel}>{d.label}</dt>
                <dd className={styles.detailValue}>{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="settings-heading">
        <h2 id="settings-heading" className={styles.sectionTitle}>
          Display &amp; accessibility
        </h2>
        <p className={styles.hint}>
          These settings apply across MediFlow on this device and are also available from the header.
        </p>
        <div className={styles.settingsRow}>
          <AppearanceToggle variant="pill" />
          <AccessibilityMenu variant="pill" />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Session</h2>
        <p className={styles.hint}>Sign out of MediFlow on this device.</p>
        <div className={styles.settingsRow}>
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
