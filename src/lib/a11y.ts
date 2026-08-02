/**
 * Accessibility helpers shared across components.
 *
 * IMPORTANT product rule (carried over from the Figma file): status must
 * never be communicated by color alone. Every status-bearing component
 * should call `describeStatus` (or otherwise pair its color with text +
 * an icon + a distinct shape) so the meaning survives in every color mode,
 * including Achromatopsia / Grayscale High Contrast.
 */
import type { StatusTone } from "@/types";

export const STATUS_TONE_ICON_LABEL: Record<StatusTone, string> = {
  success: "Success",
  pending: "Pending",
  info: "Info",
  error: "Error",
  neutral: "Neutral",
};

/** Returns a screen-reader-friendly description of a status, independent
 * of color. Use as the `aria-label` on status badges/icons. */
export function describeStatus(tone: StatusTone, label: string): string {
  return `${STATUS_TONE_ICON_LABEL[tone]}: ${label}`;
}

/** Generates a stable id for pairing a form field with its label/error
 * without relying on React 18's `useId` in places that need a plain string
 * (kept simple and dependency-free for the foundation stage). */
let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
