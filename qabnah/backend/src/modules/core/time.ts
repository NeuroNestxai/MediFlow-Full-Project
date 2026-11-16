/** Muscat is UTC+4 all year (no DST). */
export const MUSCAT_OFFSET_MIN = 240;

export function muscatNow(now = new Date()) {
  const local = new Date(now.getTime() + MUSCAT_OFFSET_MIN * 60_000);
  return {
    weekday: local.getUTCDay(), // 0 = Sunday
    month: local.getUTCMonth() + 1,
    hhmm: `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
    date: local.toISOString().slice(0, 10),
  };
}

export function inWindow(hhmm: string, start: string, end: string): boolean {
  if (end > start) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end; // spans midnight
}

export interface OpeningWindow { weekday: number; open: string; close: string }

/** Empty opening hours = governed only by the store toggle. Windows that cross midnight belong to the opening day. */
export function isWithinOpeningHours(hours: OpeningWindow[], now = new Date()): boolean {
  if (!hours || hours.length === 0) return true;
  const { weekday, hhmm } = muscatNow(now);
  const yesterday = (weekday + 6) % 7;
  return hours.some((h) => {
    if (h.close > h.open) return h.weekday === weekday && hhmm >= h.open && hhmm < h.close;
    return (h.weekday === weekday && hhmm >= h.open) || (h.weekday === yesterday && hhmm < h.close);
  });
}

export interface BlackoutWindow { months?: number[]; weekdays?: number[]; start: string; end: string }
export function inBlackout(windows: BlackoutWindow[] | null | undefined, now = new Date()): boolean {
  if (!windows?.length) return false;
  const t = muscatNow(now);
  return windows.some((w) => (!w.months || w.months.includes(t.month)) && (!w.weekdays || w.weekdays.includes(t.weekday)) && inWindow(t.hhmm, w.start, w.end));
}
