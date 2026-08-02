// ---------------------------------------------------------------------------
// Local-calendar date helpers for the staff screens.
//
// Deliberately never `toISOString()`. The clinic runs in Oman (UTC+4), so
// between 00:00 and 04:00 local time the UTC date is still yesterday — every
// "today" query would silently return the wrong day, and the queue would look
// empty at exactly the hour someone is most likely to distrust it.
// Everything here is built from local calendar fields instead.
// ---------------------------------------------------------------------------

/** Today (or any date) as a local `YYYY-MM-DD` string. */
export function localToday(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Alias used where a specific Date — not "now" — is being converted. */
export const toLocalDateString = localToday;

/**
 * Long, human form of a `YYYY-MM-DD` string, e.g. "Sunday, 3 August 2026".
 * Parsed as UTC purely so the calendar fields survive the round trip — the
 * input carries no time of day, so no shift can occur.
 */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Long, human form of a Date in the viewer's local zone. */
export function formatLongLocalDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Local wall-clock time, e.g. "2:41 PM" — used on check-in/checkout receipts. */
export function formatLocalClock(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
