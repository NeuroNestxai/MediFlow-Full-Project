import type { Service } from "@/types";
import styles from "./ServiceCard.module.css";

export interface ServiceCardProps {
  service: Service;
  onViewDoctors?: () => void;
}

export function ServiceCard({ service, onViewDoctors }: ServiceCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.topRow}>
        <span className={styles.tag}>{service.specialty}</span>
        <span className={styles.age}>{service.ageGroup}</span>
      </div>
      <h3 className={styles.name}>{service.name}</h3>
      <p className={styles.description}>{service.description}</p>
      <button className={styles.link} onClick={onViewDoctors} type="button">
        View Doctors →
      </button>
    </article>
  );
}
