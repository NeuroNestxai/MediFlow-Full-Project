import type { Doctor } from "@/types";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { Button } from "@/components/ui/Button";
import styles from "./DoctorCard.module.css";

export interface DoctorCardProps {
  doctor: Doctor;
  onViewProfile?: () => void;
  onBook?: () => void;
}

export function DoctorCard({ doctor, onViewProfile, onBook }: DoctorCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <DoctorPortrait palette={doctor.portraitPalette} size={52} />
        <div>
          <h3 className={styles.name}>{doctor.name}</h3>
          <p className={styles.specialty}>{doctor.specialty}</p>
        </div>
      </div>
      <p className={styles.protoNote}>Prototype portrait — replace with official MCC photo</p>
      <div className={styles.tags}>
        <span className={styles.tag}>{doctor.gender}</span>
        {doctor.services.slice(0, 1).map((s) => (
          <span key={s} className={styles.tagAccent}>
            {s}
          </span>
        ))}
      </div>
      <p className={styles.availability}>Next: {doctor.nextAvailable}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onViewProfile}>
          View Profile
        </Button>
        <Button variant="primary" onClick={onBook}>
          Book
        </Button>
      </div>
    </article>
  );
}
