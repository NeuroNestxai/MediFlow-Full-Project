"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import type { PageTour } from "./tours";
import styles from "./tour.module.css";

interface TourOverlayProps {
  tour: PageTour;
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

const PAD = 8; // spotlight padding around the target
const POP_W = 320;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourOverlay({ tour, stepIndex, onNext, onBack, onSkip, onFinish }: TourOverlayProps) {
  const { reducedMotion } = useAccessibility();
  const step = tour.steps[stepIndex];
  const [rect, setRect] = useState<Box | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === tour.steps.length - 1;

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.target]);

  // On each step: measure immediately, then (after paint) bring the target
  // into view and re-measure once the scroll has settled so the spotlight and
  // popover land in the right place even for off-screen targets.
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    // Measuring the target's live position necessarily reads layout and stores
    // it — the accepted useLayoutEffect measurement pattern, not a cascading
    // data effect.
    if (el) {
      // Instant centering — reliable across browsers and inherently
      // reduced-motion friendly (a tour jumping between targets shouldn't
      // animate the whole page). Called synchronously so it always applies.
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    }
    // Measure after the scroll so the spotlight + popover land correctly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    const t1 = window.setTimeout(measure, 60);
    const t2 = window.setTimeout(measure, 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step.target, measure]);

  // Keep the spotlight/popover glued to the target through scroll & resize.
  useEffect(() => {
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [measure]);

  // Move focus into the popover on every step.
  useEffect(() => {
    popRef.current?.focus();
  }, [stepIndex]);

  // Keyboard: Escape skips/closes; arrows navigate; Tab is trapped in the popover.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "Tab") {
        const focusables = popRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip]);

  // Popover placement: below the target if it fits, otherwise above; centred
  // when there is no target. Always clamped to the viewport and off the target.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  let popStyle: CSSProperties;
  let spotlight: Box | null = null;
  if (rect) {
    spotlight = {
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
    };
    const below = rect.top + rect.height + 12;
    const roomBelow = vh - below;
    const placeBelow = roomBelow > 190 || roomBelow > rect.top;
    const left = Math.min(Math.max(12, rect.left), vw - POP_W - 12);
    popStyle = placeBelow
      ? { top: below, left, maxWidth: POP_W }
      : { bottom: vh - rect.top + 12, left, maxWidth: POP_W };
  } else {
    popStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: POP_W,
    };
  }

  return (
    <div className={`${styles.root} ${reducedMotion ? styles.noMotion : ""}`}>
      {spotlight ? (
        <div
          className={styles.spotlight}
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.dimAll} aria-hidden="true" />
      )}

      <div
        ref={popRef}
        className={styles.popover}
        style={popStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className={styles.popHeader}>
          <p className={styles.progress}>
            Step {stepIndex + 1} of {tour.steps.length}
          </p>
          <button type="button" className={styles.close} onClick={onSkip} aria-label="Close tour">
            ✕
          </button>
        </div>
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p id={descId} className={styles.body}>
          {step.body}
        </p>
        <div className={styles.controls}>
          <button type="button" className={styles.skip} onClick={onSkip}>
            Skip
          </button>
          <div className={styles.navBtns}>
            {!isFirst ? (
              <button type="button" className={styles.secondary} onClick={onBack}>
                Back
              </button>
            ) : null}
            {isLast ? (
              <button type="button" className={styles.primary} onClick={onFinish}>
                Finish
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={onNext}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
