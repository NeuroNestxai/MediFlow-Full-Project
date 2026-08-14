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

interface CheckoutReceipt {
  patientName: string;
  reference: string;
  at: string;
}

export function CheckoutClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
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
    fetchStaffAppointments({ date: today, statuses: ["completed"] })
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

  async function checkOut(appt: StaffAppointment) {
    setBusyId(appt.id);
    const result = await checkOutAppointment(appt.id);
    setBusyId(null);
    if (result.ok) {
      setReceipt({
        patientName: appt.patientName,
        reference: result.reference,
        at: formatLocalClock(),
      });
      showToast("success", `${result.reference} checked out.`);
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

  if (receipt) {
    return (
      <div className={styles.page}>
        <section className={styles.successPanel} aria-live="polite">
          <StatusBadge tone="neutral" label="Checked Out" />
          <h1 className={styles.successTitle}>Checkout complete</h1>
          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>Patient</dt>
              <dd>{receipt.patientName}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Booking reference</dt>
              <dd>{receipt.reference}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Checked out at</dt>
              <dd>{receipt.at}</dd>
            </div>
          </dl>
          <div className={styles.headActions}>
            <Button variant="primary" onClick={() => setReceipt(null)}>
              Back to Checkout List
            </Button>
            <Button variant="secondary" href="/reception/dashboard">
              Back to Dashboard
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Checkout</h1>
          <p className={styles.subtitle}>
            Visits whose consultation is finished &middot; {todayLabel}
          </p>
        </div>
        <div className={styles.headActions}>
          <Button variant="secondary" href="/reception/queue">
            Open Live Queue
          </Button>
        </div>
      </header>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      <h2 className={styles.sectionTitle}>Ready for Checkout</h2>

      {state.status === "loading" ? <LoadingState label="Loading checkout list…" /> : null}
      {state.status === "error" ? (
        <ErrorState
          onRetry={() => {
            setState({ status: "loading" });
            reload();
          }}
        />
      ) : null}

      {state.status === "ready" && state.appointments.length === 0 ? (
        <EmptyState
          title="Nobody is ready for checkout"
          body="Patients appear here once the doctor completes their consultation."
          action={
            <Button variant="primary" href="/reception/queue">
              Open Live Queue
            </Button>
          }
        />
      ) : null}

      {state.status === "ready" && state.appointments.length > 0 ? (
        <ul className={styles.list}>
          {state.appointments.map((appt) => (
            <li key={appt.id} className={styles.row}>
              <DoctorPortrait palette={toPalette(appt.doctorPalette)} size={44} />
              <div className={styles.rowMain}>
                <p className={styles.patientName}>{appt.patientName}</p>
                <p className={styles.meta}>
                  {displayDoctorName(appt.doctorName)} &middot; {appt.serviceName || "—"} &middot;{" "}
                  {formatTime(appt.time)}
                </p>
                <p className={styles.ref}>
                  {appt.patientMfId ? `${appt.patientMfId} · ` : ""}
                  {appt.reference}
                </p>
              </div>
              <StatusBadge tone={DB_STATUS_TONE[appt.status]} label={DB_STATUS_LABEL[appt.status]} />
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
      ) : null}
    </div>
  );
}
