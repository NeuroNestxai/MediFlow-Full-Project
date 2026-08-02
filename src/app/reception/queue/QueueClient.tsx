"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchStaffAppointments, updateQueueStatus, subscribeToAppointments } from "@/lib/staff/client-data";
import { IN_CLINIC_STATUSES, type StaffAppointment } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatTime,
  toPalette,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import { localToday, formatLongLocalDate } from "@/lib/staff/dates";
import styles from "./page.module.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "checked_in", label: "Checked In" },
  { id: "waiting", label: "Waiting" },
  { id: "in_consultation", label: "In Consultation" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[] };

export function QueueClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<FilterId>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );

  const today = useMemo(() => localToday(), []);
  const todayLabel = useMemo(() => formatLongLocalDate(), []);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    fetchStaffAppointments({ date: today, statuses: IN_CLINIC_STATUSES })
      .then((appointments) => {
        if (active) setState({ status: "ready", appointments });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [today, reloadKey]);

  // Realtime is a progressive enhancement — it only asks for a refetch.
  useEffect(() => subscribeToAppointments(reload), [reload]);

  async function act(appt: StaffAppointment, next: "waiting" | "no_show") {
    setBusyId(appt.id);
    const result = await updateQueueStatus(appt.id, next);
    setBusyId(null);
    if (result.ok) {
      showToast(
        "success",
        next === "waiting"
          ? `${appt.patientName} moved to waiting.`
          : `${appt.patientName} marked as a no show.`,
      );
      reload();
      return;
    }
    showToast(
      "error",
      result.reason === "not_allowed"
        ? "That change is not allowed from the current status. The queue may have moved on already."
        : result.reason === "not_found"
          ? "This appointment is no longer in today's queue."
          : "Something went wrong. Nothing was changed — please try again.",
    );
  }

  const counts = useMemo(() => {
    const base: Record<FilterId, number> = {
      all: 0,
      checked_in: 0,
      waiting: 0,
      in_consultation: 0,
    };
    if (state.status !== "ready") return base;
    base.all = state.appointments.length;
    for (const a of state.appointments) {
      if (a.status === "checked_in" || a.status === "waiting" || a.status === "in_consultation") {
        base[a.status] += 1;
      }
    }
    return base;
  }, [state]);

  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    if (filter === "all") return state.appointments;
    return state.appointments.filter((a) => a.status === (filter as DbAppointmentStatus));
  }, [state, filter]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Live Queue</h1>
          <p className={styles.subtitle}>
            Patients in the clinic right now &middot; {todayLabel}
          </p>
          <p className={styles.liveTag}>Live updates active</p>
        </div>
        <div className={styles.headActions}>
          <Button variant="primary" href="/reception/qr-scan">
            Scan QR
          </Button>
          <Button variant="secondary" href="/reception/checkout">
            Checkout
          </Button>
        </div>
      </header>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      <div className={styles.filters} role="tablist" aria-label="Queue filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {state.status === "loading" ? <LoadingState label="Loading the queue…" /> : null}
      {state.status === "error" ? (
        <ErrorState
          onRetry={() => {
            setState({ status: "loading" });
            reload();
          }}
        />
      ) : null}

      {state.status === "ready" && visible.length === 0 ? (
        <EmptyState
          title="Nobody in this list"
          body="Patients appear here as soon as reception checks them in."
          action={
            <Button variant="primary" href="/reception/qr-scan">
              Check Someone In
            </Button>
          }
        />
      ) : null}

      {state.status === "ready" && visible.length > 0 ? (
        <ul className={styles.list}>
          {visible.map((appt) => (
            <li key={appt.id} className={styles.row}>
              <DoctorPortrait palette={toPalette(appt.doctorPalette)} size={44} />
              <div className={styles.rowMain}>
                <p className={styles.patientName}>{appt.patientName}</p>
                <p className={styles.meta}>
                  {displayDoctorName(appt.doctorName)} &middot; {appt.serviceName || "—"} &middot;{" "}
                  {formatTime(appt.time)}
                </p>
                <p className={styles.ref}>{appt.reference}</p>
              </div>
              <StatusBadge tone={DB_STATUS_TONE[appt.status]} label={DB_STATUS_LABEL[appt.status]} />
              <div className={styles.rowActions}>
                {appt.status === "checked_in" ? (
                  <Button
                    variant="primary"
                    disabled={busyId === appt.id}
                    onClick={() => void act(appt, "waiting")}
                  >
                    {busyId === appt.id ? "Working…" : "Move to Waiting"}
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  disabled={busyId === appt.id}
                  onClick={() => void act(appt, "no_show")}
                >
                  Mark No Show
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
