"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { BellIcon } from "@/components/ui/Icons";
import { fetchFollowUps } from "@/lib/staff/client-data";
import { FOLLOW_UP_TYPE_LABEL, type FollowUp } from "@/lib/staff/types";
import { formatDate } from "@/lib/patient/types";
import { localToday } from "@/lib/staff/dates";
import type { StatusTone } from "@/types";
import styles from "./StaffAppointments.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; followUps: FollowUp[] };

const STATUS_TONE: Record<FollowUp["status"], StatusTone> = {
  draft: "neutral",
  approved: "info",
  completed: "success",
};
const STATUS_LABEL: Record<FollowUp["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  completed: "Completed",
};

export function DoctorFollowUps() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<"due" | "upcoming" | "completed">("due");
  const activeRef = useRef(true);
  const today = useMemo(() => localToday(), []);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: "loading" });
    fetchFollowUps()
      .then((followUps) => {
        if (activeRef.current) setState({ status: "ready", followUps });
      })
      .catch(() => {
        if (activeRef.current) setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const rows = useMemo(() => {
    const all = state.status === "ready" ? state.followUps : [];
    if (tab === "completed") return all.filter((f) => f.status === "completed");
    const open = all.filter((f) => f.status !== "completed");
    return tab === "due"
      ? open.filter((f) => f.dueDate <= today)
      : open.filter((f) => f.dueDate > today);
  }, [state, tab, today]);

  return (
    <div className={styles.wrap}>
      <div className={styles.scopeSwitch} role="group" aria-label="Follow-up range">
        {(["due", "upcoming", "completed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.scopeBtn} ${tab === t ? styles.scopeActive : ""}`}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "due" ? "Due" : t === "upcoming" ? "Upcoming" : "Completed"}
          </button>
        ))}
      </div>

      {state.status === "loading" && <LoadingState label="Loading follow-ups…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "ready" && rows.length === 0 && (
        <EmptyState
          icon={<BellIcon />}
          title="Nothing here"
          body="Follow-ups you record after a consultation appear here, grouped by when they are due."
        />
      )}

      {state.status === "ready" && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((f) => (
            <li key={f.id} className={styles.row}>
              <div className={styles.when}>
                <span className={styles.time}>{formatDate(f.dueDate)}</span>
                <span className={styles.date}>Due</span>
              </div>
              <div className={styles.who}>
                <span className={styles.patient}>{FOLLOW_UP_TYPE_LABEL[f.followUpType]}</span>
                <span className={styles.meta}>{f.instructions}</span>
                {f.newAppointmentRequired ? (
                  <span className={styles.ref}>New appointment recommended</span>
                ) : null}
              </div>
              <StatusBadge tone={STATUS_TONE[f.status]} label={STATUS_LABEL[f.status]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
