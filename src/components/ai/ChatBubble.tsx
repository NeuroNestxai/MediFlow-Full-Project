import { FloOrb } from "./FloOrb";
import styles from "./ChatBubble.module.css";

export interface ChatBubbleProps {
  sender: "patient" | "ai";
  message: string;
}

export function ChatBubble({ sender, message }: ChatBubbleProps) {
  const isAI = sender === "ai";
  return (
    <div className={`${styles.row} ${isAI ? styles.aiRow : styles.patientRow}`}>
      {isAI ? <FloOrb size={28} label="MediFlow assistant message" /> : null}
      <div className={`${styles.bubble} ${isAI ? styles.aiBubble : styles.patientBubble}`}>
        {message}
      </div>
    </div>
  );
}
