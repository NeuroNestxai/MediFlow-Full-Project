import type { DirectoryService } from "@/lib/patient/types";
import styles from "@/components/cards/ServiceCard.module.css";

export interface ServiceDirectoryCardProps {
  service: DirectoryService;
  onViewDoctors?: () => void;
}

/** Supabase-backed service card (reuses the ServiceCard styling). */
export function ServiceDirectoryCard({ service, onViewDoctors }: ServiceDirectoryCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        {service.specialtyName ? <span className={styles.tag}>{service.specialtyName}</span> : null}
        {service.ageGroup ? <span className={styles.age}>{service.ageGroup}</span> : null}
      </div>
      <h3 className={styles.name}>{service.name}</h3>
      {service.description ? <p className={styles.description}>{service.description}</p> : null}
      <button className={styles.link} onClick={onViewDoctors} type="button">
        View Doctors →
      </button>
    </article>
  );
}
