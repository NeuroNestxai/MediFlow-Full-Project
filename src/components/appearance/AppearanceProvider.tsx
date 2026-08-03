"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Appearance = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface AppearanceContextValue {
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  /** The theme actually applied right now (system resolved to light/dark). */
  theme: ResolvedTheme;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const STORAGE_KEY = "mediflow.appearance";

// localStorage-backed store exposed via useSyncExternalStore — SSR/hydration
// safe (server + first client render use "system"), then the client re-renders
// with the persisted choice. An inline script in the document head applies the
// resolved theme before paint, so there is no flash of the wrong appearance.
let store: Appearance = "system";
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") store = raw;
  } catch {
    store = "system";
  }
}

function getSnapshot(): Appearance {
  ensureHydrated();
  return store;
}
function getServerSnapshot(): Appearance {
  return "system";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Re-render when the OS scheme changes (matters while in "system" mode).
  let mql: MediaQueryList | null = null;
  try {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", listener);
  } catch {
    mql = null;
  }
  return () => {
    listeners.delete(listener);
    mql?.removeEventListener("change", listener);
  };
}

function update(next: Appearance) {
  store = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable — non-fatal
  }
  listeners.forEach((l) => l());
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const theme: ResolvedTheme =
    appearance === "dark" ? "dark" : appearance === "light" ? "light" : systemPrefersDark() ? "dark" : "light";

  // Reflect onto <html> for CSS. DOM-only side effect, no React state changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setAppearance = useCallback((value: Appearance) => update(value), []);

  const value = useMemo(
    () => ({ appearance, setAppearance, theme }),
    [appearance, setAppearance, theme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within an AppearanceProvider");
  return ctx;
}
