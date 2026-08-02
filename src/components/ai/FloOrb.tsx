import styles from "./FloOrb.module.css";

export type FloState = "idle" | "listening" | "thinking" | "responding" | "success" | "error";

const STATE_GRADIENT: Record<FloState, [string, string, string]> = {
  idle: ["#12A9AE", "#4A6FB0", "#9179C6"],
  listening: ["#12A9AE", "#3FA9C9", "#5B79C0"],
  thinking: ["#5B79C0", "#7458B0", "#3B4A87"],
  responding: ["#12A9AE", "#5B79C0", "#9179C6"],
  success: ["#0A767B", "#12A9AE", "#5B79C0"],
  error: ["#D96A5C", "#903228", "#5A2620"],
};

export interface FloOrbProps {
  state?: FloState;
  size?: number;
  reducedMotion?: boolean;
  label?: string;
}

/**
 * Flo — the MediFlow AI assistant, rendered as a glossy abstract sphere
 * (never a face), matching the Figma "Flo" component set. State is
 * communicated by gradient + a screen-reader label, never color alone —
 * the label always states what Flo is doing in words.
 */
export function FloOrb({ state = "idle", size = 80, reducedMotion, label }: FloOrbProps) {
  const [c1, c2, c3] = STATE_GRADIENT[state];
  const gradientId = `flo-gradient-${state}`;
  return (
    <span
      className={styles.wrapper}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `MediFlow assistant, ${state}`}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" className={reducedMotion ? styles.static : styles.animated}>
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#F5F7FF" />
            <stop offset="35%" stopColor={c1} />
            <stop offset="70%" stopColor={c2} />
            <stop offset="100%" stopColor={c3} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={c2} opacity="0.25" />
        <circle cx="50" cy="50" r="39" fill={`url(#${gradientId})`} />
        <circle cx="50" cy="50" r="38.5" fill="none" stroke="#ffffff" strokeOpacity="0.35" />
        <ellipse cx="40" cy="38" rx="10" ry="6.5" fill="#ffffff" opacity="0.5" transform="rotate(-30 40 38)" />
      </svg>
    </span>
  );
}
