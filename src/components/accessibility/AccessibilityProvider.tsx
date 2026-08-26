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
import type { ColorMode } from "@/types";

interface AccessibilityContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  largeText: boolean;
  setLargeText: (value: boolean) => void;
}

interface AccessibilityPrefs {
  colorMode: ColorMode;
  reducedMotion: boolean;
  largeText: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

const STORAGE_KEY = "mediflow.accessibility";
const DEFAULT_PREFS: AccessibilityPrefs = {
  colorMode: "standard",
  reducedMotion: false,
  largeText: false,
};

// ---------------------------------------------------------------------------
// Preferences store, backed by localStorage and exposed to React through
// useSyncExternalStore. Reading via a store (rather than loading in an effect)
// keeps this SSR/hydration-safe without any synchronous setState in an effect:
// the server + hydration render use DEFAULT_PREFS, then the client re-renders
// once with the persisted value after hydration commits.
// ---------------------------------------------------------------------------
let store: AccessibilityPrefs = DEFAULT_PREFS;
let hydratedFromStorage = false;
const listeners = new Set<() => void>();

/** Read persisted preferences (and the OS reduced-motion preference as a
 * first-run fallback) exactly once, on the client. */
function ensureHydrated() {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AccessibilityPrefs>;
      store = {
        colorMode: saved.colorMode ?? DEFAULT_PREFS.colorMode,
        reducedMotion:
          typeof saved.reducedMotion === "boolean"
            ? saved.reducedMotion
            : DEFAULT_PREFS.reducedMotion,
        largeText:
          typeof saved.largeText === "boolean" ? saved.largeText : DEFAULT_PREFS.largeText,
      };
    } else if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      store = { ...DEFAULT_PREFS, reducedMotion: true };
    }
  } catch {
    // Malformed or blocked storage — keep defaults.
    store = DEFAULT_PREFS;
  }
}

function getSnapshot(): AccessibilityPrefs {
  ensureHydrated();
  return store;
}

function getServerSnapshot(): AccessibilityPrefs {
  return DEFAULT_PREFS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply a partial update, persist it, and notify subscribers. */
function updatePrefs(partial: Partial<AccessibilityPrefs>) {
  store = { ...store, ...partial };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable (private browsing, etc.) — non-fatal.
  }
  listeners.forEach((listener) => listener());
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { colorMode, reducedMotion, largeText } = prefs;

  // Reflect preferences onto the document element for CSS to consume. These
  // effects only touch the DOM (an external system) — no React state changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-color-mode", colorMode);
  }, [colorMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduced-motion", String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.setAttribute("data-large-text", String(largeText));
  }, [largeText]);

  const setColorMode = useCallback((mode: ColorMode) => updatePrefs({ colorMode: mode }), []);
  const setReducedMotion = useCallback(
    (value: boolean) => updatePrefs({ reducedMotion: value }),
    [],
  );
  const setLargeText = useCallback((value: boolean) => updatePrefs({ largeText: value }), []);

  const value = useMemo(
    () => ({ colorMode, setColorMode, reducedMotion, setReducedMotion, largeText, setLargeText }),
    [colorMode, setColorMode, reducedMotion, setReducedMotion, largeText, setLargeText],
  );

  return (
    <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return ctx;
}
