import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../api/types';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatRelative, formatTime } from '../format/format';
import { prefs } from '../auth/tokenStore';
import { common } from './common';

export type Dict = Record<string, string>;
export interface Dictionaries { ar: Dict; en: Dict }

/** Look up `key` in `dict` (falling back to `fallback`, then the key itself) and interpolate `{name}` placeholders. */
export function translate(dict: Dict, key: string, vars?: Record<string, string | number>, fallback?: Dict): string {
  const template = dict[key] ?? fallback?.[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export const dirFor = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

export function applyDocumentLang(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirFor(lang);
}

export interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  /** Pick the bilingual field for the current language, falling back to the other one. */
  pick: (en: string | null | undefined, ar: string | null | undefined) => string;
  money: (baisa: number | null | undefined, opts?: { signed?: boolean }) => string;
  num: (n: number | null | undefined, digits?: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  date: (iso: string | null | undefined) => string;
  time: (iso: string | null | undefined) => string;
  relative: (iso: string | null | undefined) => string;
}

const Ctx = createContext<I18n | null>(null);

/** Reads `?lang=ar|en` from the current URL (first load only). */
export function langFromUrl(search: string = typeof window !== 'undefined' ? window.location.search : ''): Lang | null {
  try {
    const v = new URLSearchParams(search).get('lang')?.toLowerCase();
    return v === 'ar' || v === 'en' ? v : null;
  } catch { return null; }
}

export function I18nProvider({ dictionaries, defaultLang, storageKey, children }: { dictionaries: Dictionaries; defaultLang: Lang; storageKey: string; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    // An explicit `?lang=ar|en` (e.g. links from the marketing site) wins on first load and is remembered.
    const fromUrl = langFromUrl();
    if (fromUrl) { prefs.set(storageKey, fromUrl); return fromUrl; }
    const saved = prefs.get<string | null>(storageKey, null);
    return saved === 'ar' || saved === 'en' ? saved : defaultLang;
  });
  const merged = useMemo(() => ({ ar: { ...common.ar, ...dictionaries.ar }, en: { ...common.en, ...dictionaries.en } }), [dictionaries]);
  useEffect(() => { applyDocumentLang(lang); }, [lang]);
  const setLang = useCallback((l: Lang) => { prefs.set(storageKey, l); setLangState(l); }, [storageKey]);
  const value = useMemo<I18n>(() => {
    const dict = merged[lang];
    const fb = merged.en;
    return {
      lang,
      dir: dirFor(lang),
      t: (key, vars) => translate(dict, key, vars, fb),
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      pick: (en, ar) => (lang === 'ar' ? ar || en || '' : en || ar || ''),
      money: (b, opts) => formatMoney(b, lang, opts),
      num: (n, digits = 1) => formatNumber(n, lang, digits),
      dateTime: (iso) => formatDateTime(iso, lang),
      date: (iso) => formatDate(iso, lang),
      time: (iso) => formatTime(iso, lang),
      relative: (iso) => formatRelative(iso, lang),
    };
  }, [lang, merged, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
