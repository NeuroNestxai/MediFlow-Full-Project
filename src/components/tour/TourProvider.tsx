"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PageTour } from "./tours";
import { TourOverlay } from "./TourOverlay";

interface ActiveTour {
  tour: PageTour;
  stepIndex: number;
}

interface TourContextValue {
  start: (tour: PageTour) => void;
  isActive: boolean;
  isCompleted: (tour: PageTour) => boolean;
  inviteDismissed: boolean;
  dismissInvite: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

const DONE_KEY = "mediflow.tour.done"; // { [tourId]: version }
const INVITE_KEY = "mediflow.tour.invite"; // "dismissed"

function readDone(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(DONE_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

// Tiny external store for the invite preference so it stays SSR-safe (server
// renders "dismissed" → hidden) without any setState-in-effect.
const inviteListeners = new Set<() => void>();
function subscribeInvite(listener: () => void) {
  inviteListeners.add(listener);
  return () => inviteListeners.delete(listener);
}
function inviteSnapshot(): boolean {
  try {
    return window.localStorage.getItem(INVITE_KEY) === "dismissed";
  } catch {
    return false;
  }
}
function inviteServerSnapshot(): boolean {
  return true;
}

/**
 * Provides the reusable Patient guided-tour system. Tour completion and the
 * first-visit invitation preference are the ONLY things stored — in
 * localStorage, keyed by tour id + version so an updated tour can be re-shown
 * without wiping other preferences. No personal or health data is stored.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveTour | null>(null);
  const inviteDismissed = useSyncExternalStore(
    subscribeInvite,
    inviteSnapshot,
    inviteServerSnapshot,
  );
  const launcherRef = useRef<HTMLElement | null>(null);

  const start = useCallback((tour: PageTour) => {
    launcherRef.current = (document.activeElement as HTMLElement) ?? null;
    setActive({ tour, stepIndex: 0 });
  }, []);

  const finish = useCallback((completed: boolean) => {
    setActive((cur) => {
      if (cur && completed) {
        try {
          const done = readDone();
          done[cur.tour.id] = cur.tour.version;
          window.localStorage.setItem(DONE_KEY, JSON.stringify(done));
        } catch {
          /* storage unavailable — non-fatal */
        }
      }
      return null;
    });
    // Restore focus to whatever opened the tour.
    window.setTimeout(() => launcherRef.current?.focus?.(), 0);
  }, []);

  const next = useCallback(() => {
    setActive((cur) => {
      if (!cur) return cur;
      if (cur.stepIndex >= cur.tour.steps.length - 1) {
        finish(true);
        return null;
      }
      return { ...cur, stepIndex: cur.stepIndex + 1 };
    });
  }, [finish]);

  const back = useCallback(() => {
    setActive((cur) => (cur ? { ...cur, stepIndex: Math.max(0, cur.stepIndex - 1) } : cur));
  }, []);

  const dismissInvite = useCallback(() => {
    try {
      window.localStorage.setItem(INVITE_KEY, "dismissed");
    } catch {
      /* non-fatal */
    }
    inviteListeners.forEach((l) => l());
  }, []);

  const isCompleted = useCallback((tour: PageTour) => {
    return readDone()[tour.id] === tour.version;
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({ start, isActive: active !== null, isCompleted, inviteDismissed, dismissInvite }),
    [start, active, isCompleted, inviteDismissed, dismissInvite],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active ? (
        <TourOverlay
          tour={active.tour}
          stepIndex={active.stepIndex}
          onNext={next}
          onBack={back}
          onSkip={() => finish(false)}
          onFinish={() => finish(true)}
        />
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
