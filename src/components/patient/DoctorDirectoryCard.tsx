import type { DirectoryDoctor } from "@/lib/patient/types";
import { toPalette, displayDoctorName } from "@/lib/patient/types";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { Button } from "@/components/ui/Button";
import styles from "@/components/cards/DoctorCard.module.css";

export interface DoctorDirectoryCardProps {
  doctor: DirectoryDoctor;
  onViewProfile?: () => void;
  onBook?: () => void;
}

/**
 * Supabase-backed doctor card. Specialties come from the doctor_specialties
 * junction and may be zero, one, or many. A doctor with no approved services is
 * shown but not bookable (no fake "next" time; disabled Book).
 */
export function DoctorDirectoryCard({ doctor, onViewProfile, onBook }: DoctorDirectoryCardProps) {
  const bookable = doctor.services.length > 0;

  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <DoctorPortrait palette={toPalette(doctor.portraitPalette)} size={52} />
        <div>
          <h3 className={styles.name}>{displayDoctorName(doctor.fullName)}</h3>
          {doctor.gender ? <p className={styles.specialty}>{doctor.gender}</p> : null}
        </div>
      </div>
      <p className={styles.protoNote}>Prototype portrait — replace with official MCC photo</p>
      <div className={styles.tags}>
        {doctor.specialties.length > 0 ? (
          doctor.specialties.map((s) => (
            <span key={s.id} className={styles.tagAccent}>
              {s.name}
            </span>
          ))
        ) : (
          <span className={styles.tag}>Specialty not listed</span>
        )}
      </div>
      {bookable ? null : (
        <p className={styles.availability}>No bookable service currently available</p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onViewProfile}>
          View Profile
        </Button>
        <Button variant="primary" onClick={bookable ? onBook : undefined} disabled={!bookable}>
          Book
        </Button>
      </div>
    </article>
  );
}
