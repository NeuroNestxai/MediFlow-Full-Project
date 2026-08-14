"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { AppointmentListCard } from "@/components/patient/AppointmentListCard";
import { RescheduleDialog } from "./RescheduleDialog";
import { fetchMyAppointments, cancelAppointment } from "@/lib/patient/client-data";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CANCELLABLE_STATUSES,
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  formatDate,
  formatTime,
  type PatientAppointment,
} from "@/lib/patient/types";
import styles from "./page.module.css";

const TABS = ["Upcoming", "Completed", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: PatientAppointment[] };

export function AppointmentsClient() {
  const [tab, setTab] = useState<Tab>("Upcoming");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [detailsFor, setDetailsFor] = useState<PatientAppointment | null>(null);
  const [cancelFor, setCancelFor] = useState<PatientAppointment | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<PatientAppointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyAppointments()
      .then((appointments) => {
        if (active) setState({ status: "ready", appointments });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function retry() {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  const visible = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.appointments.filter((a) => {
      // Every status must fall into exactly one tab, or a visit disappears
      // from the patient's history. `waiting` and `in_consultation` mean the
      // patient is at the clinic right now, so they belong under Upcoming;
      // `checked_out` is a finished visit, so it belongs under Completed.
      if (tab === "Upcoming") {
        return [
          "pending_approval",
          "scheduled",
          "confirmed",
          "checked_in",
          "waiting",
          "in_consultation",
        ].includes(a.status);
      }
      if (tab === "Completed") return ["completed", "checked_out"].includes(a.status);
      return ["cancelled", "rejected", "no_show"].includes(a.status);
    });
  }, [state, tab]);

  async function confirmCancel() {
    if (!cancelFor) return;
    setCancelling(true);
    const result = await cancelAppointment(cancelFor.id);
    setCancelling(false);
    setCancelFor(null);
    if (result.ok) {
      setToast({ tone: "success", message: "Your appointment has been cancelled." });
      setReloadKey((k) => k + 1);
    } else {
      setToast({ tone: "error", message: "We couldn't cancel this appointment. Please try again." });
    }
    window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Appointments</h1>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Appointment filters">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`${styles.tab} ${tab === t ? styles.activeTab : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {state.status === "loading" && <LoadingState label="Loading your appointments…" />}
      {state.status === "error" && <ErrorState onRetry={retry} />}
      {state.status === "ready" && visible.length === 0 && (
        <EmptyState
          title="No appointments here"
          body="When you book a visit, it will show up in the matching tab."
          action={
            <Button variant="primary" href="/patient/booking">
              Book an Appointment
            </Button>
          }
        />
      )}
      {state.status === "ready" && visible.length > 0 && (
        <div className={styles.list}>
          {visible.map((appt) => {
            const cancellable = CANCELLABLE_STATUSES.includes(appt.status);
            return (
              <AppointmentListCard
                key={appt.id}
                appointment={appt}
                onViewDetails={() => setDetailsFor(appt)}
                onCancel={() => setCancelFor(appt)}
                onReschedule={() => setRescheduleFor(appt)}
                cancellable={tab === "Upcoming" && cancellable}
                reschedulable={tab === "Upcoming" && cancellable}
              />
            );
          })}
        </div>
      )}

      <Dialog
        open={!!detailsFor}
        onClose={() => setDetailsFor(null)}
        title="Appointment Details"
        description={detailsFor ? `Booking reference ${detailsFor.reference}` : undefined}
      >
        {detailsFor ? (
          <div className={styles.dialogBody}>
            <p>
              <strong>Doctor:</strong> {detailsFor.doctorName ?? "—"}
            </p>
            <p>
              <strong>Service:</strong> {detailsFor.serviceName ?? "—"}
            </p>
            <p>
              <strong>Date &amp; time:</strong> {formatDate(detailsFor.date)} · {formatTime(detailsFor.time)}
            </p>
            <p className={styles.statusRow}>
              <strong>Status:</strong>{" "}
              <StatusBadge
                tone={DB_STATUS_TONE[detailsFor.status]}
                label={DB_STATUS_LABEL[detailsFor.status]}
              />
            </p>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!cancelFor}
        onClose={() => (cancelling ? undefined : setCancelFor(null))}
        title="Cancel this appointment?"
        description="This will release your slot so you can book a new one anytime."
      >
        {cancelFor ? (
          <div className={styles.dialogActions}>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Confirm Cancellation"}
            </Button>
            <Button variant="secondary" onClick={() => setCancelFor(null)} disabled={cancelling}>
              Keep Appointment
            </Button>
          </div>
        ) : null}
      </Dialog>

      {rescheduleFor ? (
        <RescheduleDialog
          appointment={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
          onSuccess={(message) => {
            setRescheduleFor(null);
            setToast({ tone: "success", message });
            setReloadKey((k) => k + 1);
            window.setTimeout(() => setToast(null), 4000);
          }}
        />
      ) : null}
    </div>
  );
}
