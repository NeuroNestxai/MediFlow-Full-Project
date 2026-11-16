import type { Lang } from '../api/types';

export const TIME_ZONE = 'Asia/Muscat';
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Replace Western digits with Arabic-Indic digits and use the Arabic decimal/thousands separators. */
export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬');
}

/** Group an integer string with commas: 1234567 → 1,234,567 */
function group(int: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "2.500" — baisa as OMR with three decimals, no currency. Exact integer arithmetic (no floats). */
export function baisaToOmrString(baisa: number): string {
  const neg = baisa < 0;
  const abs = Math.abs(Math.round(baisa));
  const omr = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, '0');
  return `${neg ? '-' : ''}${group(String(omr))}.${frac}`;
}

/**
 * Format integer baisa for display.
 *  en → "OMR 2.500"   ar → "٢٫٥٠٠ ر.ع."
 */
export function formatMoney(baisa: number | null | undefined, lang: Lang = 'en', opts: { signed?: boolean } = {}): string {
  if (baisa == null || Number.isNaN(baisa)) return '—';
  const sign = opts.signed && baisa > 0 ? '+' : '';
  const s = baisaToOmrString(baisa);
  if (lang === 'ar') {
    const neg = s.startsWith('-');
    const body = toArabicDigits(neg ? s.slice(1) : s);
    return `${neg ? '-' : sign}${body} ر.ع.`;
  }
  return s.startsWith('-') ? `-OMR ${s.slice(1)}` : `${sign}OMR ${s}`;
}

/**
 * Parse a user-typed OMR amount ("2.5", "2,500", "٢٫٥") into integer baisa.
 * Returns null for empty/invalid input or more than 3 decimals.
 */
export function parseOmrToBaisa(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/[٬,\s]/g, '');
  s = s.replace(/^(OMR|ر\.ع\.?)/i, '').replace(/(OMR|ر\.ع\.?)$/i, '').trim();
  if (!/^-?\d+(\.\d{0,3})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const baisa = Number(int) * 1000 + Number(frac.padEnd(3, '0') || '0');
  return neg ? -baisa : baisa;
}

/** Number with locale digits. */
export function formatNumber(n: number | null | undefined, lang: Lang = 'en', maxFractionDigits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  const s = new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(n);
  return lang === 'ar' ? toArabicDigits(s) : s;
}

function locale(lang: Lang) {
  return lang === 'ar' ? 'ar-OM-u-nu-arab' : 'en-GB';
}

/** Date and time in Muscat: "16 Nov 2026, 22:07" / Arabic equivalent. */
export function formatDateTime(iso: string | null | undefined, lang: Lang = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function formatDate(iso: string | null | undefined, lang: Lang = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+04:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function formatTime(iso: string | null | undefined, lang: Lang = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** Today's date in Muscat as YYYY-MM-DD. */
export function muscatToday(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

/** "5 min ago" style relative time. */
export function formatRelative(iso: string | null | undefined, lang: Lang = 'en', now = Date.now()): string {
  if (!iso) return '—';
  const diffS = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-arab' : 'en', { numeric: 'auto' });
  const abs = Math.abs(diffS);
  if (abs < 60) return rtf.format(diffS, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffS / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffS / 3600), 'hour');
  return rtf.format(Math.round(diffS / 86400), 'day');
}

export function formatDistance(m: number | null | undefined, lang: Lang = 'en'): string {
  if (m == null) return '—';
  const km = m / 1000;
  return lang === 'ar' ? `${formatNumber(km, 'ar', 1)} كم` : `${formatNumber(km, 'en', 1)} km`;
}

export function formatDuration(seconds: number | null | undefined, lang: Lang = 'en'): string {
  if (seconds == null) return '—';
  const min = Math.max(1, Math.round(seconds / 60));
  return lang === 'ar' ? `${formatNumber(min, 'ar', 0)} د` : `${min} min`;
}

/** Basis points as a percentage: 1500 → "15%". */
export function formatBps(bps: number | null | undefined, lang: Lang = 'en'): string {
  if (bps == null) return '—';
  return `${formatNumber(bps / 100, lang, 2)}%`;
}

/** Normalise an Omani mobile number to E.164 (+968XXXXXXXX) or return null if invalid (mirrors the backend rule). */
export function normalizeOmanPhone(input: string): string | null {
  let d = (input ?? '').replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '968' + d;
  return /^968[79]\d{7}$/.test(d) ? `+${d}` : null;
}
