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
  approveAppointment,
  rejectAppointment,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import type { StaffAppointment } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatDate,
  formatTime,
  toPalette,
} from "@/lib/patient/types";
import { localToday, formatLongLocalDate, formatLocalClock } from "@/lib/staff/dates";
import styles from "./page.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[]; pending: StaffAppointment[] };

/** Statuses that mean the patient has not arrived yet — the "next arrivals" list. */
const UPCOMING_STATUSES = new Set(["scheduled", "confirmed"]);

/** Message shown when the reception session hasn't completed two-factor auth. */
const MFA_MESSAGE =
  "Approving or rejecting a booking needs two-factor authentication. Please enable 2FA on this reception account (Supabase MFA), then sign in again.";

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
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchStaffAppointments({ date: today }),
      fetchStaffAppointments({ statuses: ["pending_approval"] }),
    ])
      .then(([appointments, pending]) => {
        if (active) setState({ status: "ready", appointments, pending });
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
  const pending = useMemo(() => (state.status === "ready" ? state.pending : []), [state]);

  const stats = useMemo(() => {
    const count = (predicate: (a: StaffAppointment) => boolean) =>
      appointments.filter(predicate).length;
    return [
      { label: "Pending Approval", value: pending.length },
      { label: "Today's Appointments", value: appointments.length },
      { label: "Checked In", value: count((a) => a.status === "checked_in") },
      { label: "Waiting", value: count((a) => a.status === "waiting") },
      { label: "In Consultation", value: count((a) => a.status === "in_consultation") },
      { label: "Ready for Checkout", value: count((a) => a.status === "completed") },
      {
        label: "Cancelled / No Show",
        value: count((a) => a.status === "cancelled" || a.status === "no_show"),
      },
    ];
  }, [appointments, pending]);

  const nextArrivals = useMemo(
    () => appointments.filter((a) => UPCOMING_STATUSES.has(a.status)).slice(0, 6),
    [appointments],
  );

  const readyForCheckout = useMemo(
    () => appointments.filter((a) => a.status === "completed"),
    [appointments],
  );

  function approvalErrorMessage(reason: string): string {
    if (reason === "mfa_required") return MFA_MESSAGE;
    if (reason === "not_allowed")
      return "You don't have permission to approve bookings, or your session has expired.";
    if (reason === "not_pending") return "That booking is no longer awaiting approval.";
    if (reason === "not_found") return "That booking is no longer available.";
    return "Something went wrong. Nothing was changed — please try again.";
  }

  async function approve(appt: StaffAppointment) {
    setBusyId(appt.id);
    const result = await approveAppointment(appt.id);
    setBusyId(null);
    if (result.ok) {
      showToast("success", `${result.reference} approved — the patient has been notified.`);
      reload();
      return;
    }
    showToast(result.reason === "mfa_required" ? "info" : "error", approvalErrorMessage(result.reason));
  }

  async function reject(appt: StaffAppointment) {
    const reason = window.prompt(
      `Reject booking ${appt.reference}?\n\nOptional reason (shared with the patient by email):`,
      "",
    );
    if (reason === null) return; // cancelled the prompt
    setBusyId(appt.id);
    const result = await rejectAppointment(appt.id, reason || undefined);
    setBusyId(null);
    if (result.ok) {
      showToast("info", `${result.reference} rejected — the patient has been notified.`);
      reload();
      return;
    }
    showToast(result.reason === "mfa_required" ? "info" : "error", approvalErrorMessage(result.reason));
  }

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
          <Button variant="primary" href="/reception/qr-scan">
            Scan QR
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

          <section aria-labelledby="pending-heading">
            <h2 id="pending-heading" className={styles.sectionTitle}>
              Pending approvals
            </h2>
            {pending.length === 0 ? (
              <EmptyState
                title="No bookings awaiting approval"
                body="New booking requests appear here for you to accept or reject."
              />
            ) : (
              <ul className={styles.list}>
                {pending.map((appt) => (
                  <li key={appt.id} className={styles.row}>
                    <DoctorPortrait palette={toPalette(appt.doctorPalette)} size={44} />
                    <div className={styles.rowMain}>
                      <p className={styles.patientName}>
                        {appt.patientName}
                        {appt.patientMfId ? (
                          <span className={styles.mfId}>{appt.patientMfId}</span>
                        ) : null}
                      </p>
                      <p className={styles.meta}>
                        {displayDoctorName(appt.doctorName)} &middot; {appt.serviceName || "—"} &middot;{" "}
                        {formatDate(appt.date)} &middot; {formatTime(appt.time)}
                      </p>
                      <p className={styles.ref}>{appt.reference}</p>
                    </div>
                    <StatusBadge
                      tone={DB_STATUS_TONE[appt.status]}
                      label={DB_STATUS_LABEL[appt.status]}
                    />
                    <div className={styles.rowActions}>
                      <Button
                        variant="primary"
                        disabled={busyId === appt.id}
                        onClick={() => void approve(appt)}
                      >
                        {busyId === appt.id ? "Working…" : "Accept"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyId === appt.id}
                        onClick={() => void reject(appt)}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                      <p className={styles.patientName}>
                        {appt.patientName}
                        {appt.patientMfId ? (
                          <span className={styles.mfId}>{appt.patientMfId}</span>
                        ) : null}
                      </p>
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
                      <p className={styles.patientName}>
                        {appt.patientName}
                        {appt.patientMfId ? (
                          <span className={styles.mfId}>{appt.patientMfId}</span>
                        ) : null}
                      </p>
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
