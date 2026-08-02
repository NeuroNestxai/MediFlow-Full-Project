import styles from "./Chips.module.css";

export function PromptChip({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button className={styles.promptChip} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export interface TimeSlotChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}

export function TimeSlotChip({ label, selected, onClick }: TimeSlotChipProps) {
  return (
    <button
      className={`${styles.slotChip} ${selected ? styles.slotSelected : ""}`}
      onClick={onClick}
      type="button"
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}
