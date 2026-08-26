import { FloOrb } from "./FloOrb";
import styles from "./ChatBubble.module.css";

export interface ChatBubbleProps {
  sender: "patient" | "ai";
  message: string;
  reducedMotion?: boolean;
}

/**
 * A single chat message. Replies are always rendered as PLAIN TEXT (no
 * dangerouslySetInnerHTML, no markdown-to-HTML) — whitespace is preserved and
 * long words / URLs wrap instead of overflowing. Sender is distinguished by
 * alignment, a text label, and bubble shape, never by colour alone.
 */
export function ChatBubble({ sender, message, reducedMotion }: ChatBubbleProps) {
  const isAI = sender === "ai";
  return (
    <div className={`${styles.row} ${isAI ? styles.aiRow : styles.patientRow}`}>
      {isAI ? (
        <span className={styles.avatar} aria-hidden="true">
          <FloOrb size={30} state="idle" reducedMotion={reducedMotion} label="" />
        </span>
      ) : null}
      <div className={styles.stack}>
        <span className={styles.name}>{isAI ? "MediFlow" : "You"}</span>
        <div className={`${styles.bubble} ${isAI ? styles.aiBubble : styles.patientBubble}`}>
          {message}
        </div>
      </div>
    </div>
  );
}

/**
 * Thinking indicator, styled as a normal MediFlow response so it sits in the
 * message flow (not floating text). Announced politely; the three dots animate
 * unless reduced motion is active, in which case a static marker remains.
 */
export function ThinkingBubble({ reducedMotion }: { reducedMotion?: boolean }) {
  return (
    <div className={`${styles.row} ${styles.aiRow}`} role="status" aria-live="polite">
      <span className={styles.avatar} aria-hidden="true">
        <FloOrb size={30} state="thinking" reducedMotion={reducedMotion} label="" />
      </span>
      <div className={styles.stack}>
        <span className={styles.name}>MediFlow</span>
        <div className={`${styles.bubble} ${styles.aiBubble} ${styles.thinking}`}>
          <span className={styles.thinkingText}>MediFlow is thinking</span>
          <span
            className={`${styles.dots} ${reducedMotion ? styles.dotsStatic : ""}`}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}
