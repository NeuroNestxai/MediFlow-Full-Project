"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import {
  fetchStaffAppointments,
  checkOutAppointment,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import type { StaffAppointment } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatTime,
  toPalette,
} from "@/lib/patient/types";
import { localToday, formatLongLocalDate, formatLocalClock } from "@/lib/staff/dates";
import styles from "./page.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[] };

/** Statuses that mean the patient has not arrived yet — the "next arrivals" list. */
const UPCOMING_STATUSES = new Set(["scheduled", "confirmed"]);

export function DashboardClient({ displayName }: { displayName: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
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
    fetchStaffAppointments({ date: today })
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

  const appointments = useMemo(
    () => (state.status === "ready" ? state.appointments : []),
    [state],
  );

  const stats = useMemo(() => {
    const count = (predicate: (a: StaffAppointment) => boolean) =>
      appointments.filter(predicate).length;
    return [
      { label: "Today's Appointments", value: appointments.length },
      { label: "Checked In", value: count((a) => a.status === "checked_in") },
      { label: "Waiting", value: count((a) => a.status === "waiting") },
      { label: "In Consultation", value: count((a) => a.status === "in_consultation") },
      { label: "Ready for Checkout", value: count((a) => a.status === "completed") },
      { label: "Checked Out", value: count((a) => a.status === "checked_out") },
      {
        label: "Cancelled / No Show",
        value: count((a) => a.status === "cancelled" || a.status === "no_show"),
      },
    ];
  }, [appointments]);

  const nextArrivals = useMemo(
    () => appointments.filter((a) => UPCOMING_STATUSES.has(a.status)).slice(0, 6),
    [appointments],
  );

  const readyForCheckout = useMemo(
    () => appointments.filter((a) => a.status === "completed"),
    [appointments],
  );

  async function checkOut(appt: StaffAppointment) {
    setBusyId(appt.id);
    const result = await checkOutAppointment(appt.id);
    setBusyId(null);
    if (result.ok) {
      showToast("success", `${result.reference} checked out at ${formatLocalClock()}.`);
      reload();
      return;
    }
    showToast(
      "error",
      result.reason === "not_allowed"
        ? "This visit cannot be checked out yet — the consultation must be completed first."
        : result.reason === "not_found"
          ? "That appointment is no longer available."
          : "Something went wrong. Nothing was changed — please try again.",
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.greeting}>Good day, {displayName}.</h1>
          <p className={styles.subGreeting}>
            Here&rsquo;s today&rsquo;s MCC clinic activity &middot; {todayLabel}
          </p>
          <p className={styles.liveTag}>Live updates active</p>
        </div>
        <div className={styles.headActions}>
          <Button variant="primary" href="/reception/check-in">
            Check In
          </Button>
          <Button variant="secondary" href="/reception/booking">
            Book Appointment
          </Button>
          <Button variant="secondary" href="/reception/queue">
            Open Live Queue
          </Button>
          <Button variant="secondary" href="/reception/checkout">
            Checkout
          </Button>
        </div>
      </div>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      {state.status === "loading" ? <LoadingState label="Loading today's activity…" /> : null}
      {state.status === "error" ? (
        <ErrorState
          onRetry={() => {
            setState({ status: "loading" });
            reload();
          }}
        />
      ) : null}

      {state.status === "ready" ? (
        <>
          <div className={styles.statsRow}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.statCard}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>

          <section aria-labelledby="arrivals-heading">
            <h2 id="arrivals-heading" className={styles.sectionTitle}>
              Next arrivals
            </h2>
            {nextArrivals.length === 0 ? (
              <EmptyState
                title="No one left to arrive"
                body="Every booked patient for today has already been checked in or has moved on."
              />
            ) : (
              <ul className={styles.list}>
                {nextArrivals.map((appt) => (
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
                    <StatusBadge
                      tone={DB_STATUS_TONE[appt.status]}
                      label={DB_STATUS_LABEL[appt.status]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="checkout-heading">
            <h2 id="checkout-heading" className={styles.sectionTitle}>
              Ready for checkout
            </h2>
            {readyForCheckout.length === 0 ? (
              <EmptyState
                title="Nobody is ready for checkout"
                body="Patients appear here once the doctor completes their consultation."
              />
            ) : (
              <ul className={styles.list}>
                {readyForCheckout.map((appt) => (
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
                    <StatusBadge
                      tone={DB_STATUS_TONE[appt.status]}
                      label={DB_STATUS_LABEL[appt.status]}
                    />
                    <Button
                      variant="primary"
                      disabled={busyId === appt.id}
                      onClick={() => void checkOut(appt)}
                    >
                      {busyId === appt.id ? "Checking out…" : "Check Out"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
