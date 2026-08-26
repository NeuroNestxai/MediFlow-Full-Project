import type { CSSProperties } from "react";
import styles from "./FloOrb.module.css";

export type FloState = "idle" | "listening" | "thinking" | "responding" | "success" | "error";

/** Per-state gradient stops (teal → blue → violet family; error shifts warm).
 * Colour is never the only signal — the wrapper carries an aria-label that
 * states, in words, what Flo is doing. */
const STATE_GRADIENT: Record<FloState, [string, string, string]> = {
  idle: ["#12A9AE", "#4A6FB0", "#9179C6"],
  listening: ["#12A9AE", "#3FA9C9", "#5B79C0"],
  thinking: ["#12A9AE", "#5B79C0", "#9179C6"],
  responding: ["#12A9AE", "#5B79C0", "#9179C6"],
  success: ["#0A767B", "#12A9AE", "#5B79C0"],
  error: ["#E0917F", "#D96A5C", "#903228"],
};

export interface FloOrbProps {
  state?: FloState;
  size?: number;
  reducedMotion?: boolean;
  label?: string;
}

const STATE_VERB: Record<FloState, string> = {
  idle: "ready",
  listening: "listening",
  thinking: "thinking",
  responding: "responding",
  success: "ready",
  error: "having trouble connecting",
};

/**
 * Flo — the MediFlow assistant identity, rendered as a calm abstract sphere
 * (never a face, never the company logo). Built from layered CSS gradients so
 * every state animates with transform/opacity only (no JS loops, no canvas):
 *
 * - idle       slow breathing + gentle float + soft glow
 * - listening  slightly brighter, quicker breathing
 * - thinking   internal gradient swirl travels, stronger glow
 * - responding gentle outward glow, calm movement
 * - success    one brief expansion, then settles
 * - error      warm gradient, no shaking/flashing
 *
 * When reduced motion is requested (in-app toggle OR the OS preference) every
 * animation freezes and a polished static sphere is shown.
 */
export function FloOrb({ state = "idle", size = 80, reducedMotion, label }: FloOrbProps) {
  const [c1, c2, c3] = STATE_GRADIENT[state];
  const style = {
    width: size,
    height: size,
    "--flo-c1": c1,
    "--flo-c2": c2,
    "--flo-c3": c3,
  } as CSSProperties;

  // An explicit empty label means the orb is decorative (e.g. it sits next to
  // a visible "MediFlow" name), so hide it from assistive tech entirely.
  const decorative = label === "";

  return (
    <span
      className={`${styles.wrapper} ${reducedMotion ? styles.static : ""}`}
      style={style}
      data-state={state}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : (label ?? `MediFlow assistant, ${STATE_VERB[state]}`)}
    >
      <span className={styles.glow} aria-hidden="true" />
      <span className={styles.orb} aria-hidden="true">
        <span className={styles.swirl} />
        <span className={styles.sheen} />
      </span>
    </span>
  );
}
