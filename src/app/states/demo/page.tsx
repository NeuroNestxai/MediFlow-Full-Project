"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineState,
  PermissionState,
  SessionExpiredState,
} from "@/components/states/StatePanel";
import styles from "./page.module.css";

const STATES = [
  "loading",
  "empty",
  "error",
  "offline",
  "permission",
  "session-expired",
] as const;
type StateKind = (typeof STATES)[number];

const STATE_LABEL: Record<StateKind, string> = {
  loading: "Loading",
  empty: "Empty",
  error: "Error",
  offline: "Offline",
  permission: "Permission Denied",
  "session-expired": "Session Expired",
};

/**
 * Representative screen 5/6 — shared system-state reference.
 * Every state here uses the same StatePanel building block: icon + title
 * + supporting text + (usually) a clear next action, matching the Figma
 * "State Panel" component set. Switch between them with the tabs below.
 */
export default function SystemStatesDemoPage() {
  const [active, setActive] = useState<StateKind>("loading");

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>System States</h1>
      <p className={styles.subtitle}>
        Reference states used across MediFlow whenever data is loading, absent, fails to
        load, or access is restricted.
      </p>

      <div role="tablist" aria-label="System state examples" className={styles.tabs}>
        {STATES.map((state) => (
          <button
            key={state}
            role="tab"
            type="button"
            aria-selected={active === state}
            className={`${styles.tab} ${active === state ? styles.activeTab : ""}`}
            onClick={() => setActive(state)}
          >
            {STATE_LABEL[state]}
          </button>
        ))}
      </div>

      <div className={styles.stage} role="tabpanel">
        {active === "loading" && <LoadingState />}
        {active === "empty" && (
          <EmptyState
            action={
              <Button href="/patient/dashboard" variant="primary">
                Return to Dashboard
              </Button>
            }
          />
        )}
        {active === "error" && <ErrorState onRetry={() => setActive("loading")} />}
        {active === "offline" && <OfflineState />}
        {active === "permission" && <PermissionState />}
        {active === "session-expired" && (
          <SessionExpiredState onSignIn={() => setActive("loading")} />
        )}
      </div>
    </div>
  );
}
