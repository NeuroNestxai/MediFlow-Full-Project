"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { AppointmentListCard } from "@/components/patient/AppointmentListCard";
import { CalendarIcon } from "@/components/ui/Icons";
import { PatientPage, PatientPageHeader } from "@/components/patient/PatientPage";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { RescheduleDialog } from "./RescheduleDialog";
import { fetchMyAppointments, cancelAppointment, setWantsEarlier } from "@/lib/patient/client-data";
import {
  CANCELLABLE_STATUSES,
  DB_STATUS_LABEL,
  formatDate,
  formatTime,
  type PatientAppointment,
} from "@/lib/patient/types";
import styles from "./page.module.css";

const QR_ACTIVE = ["scheduled", "confirmed", "checked_in", "waiting", "in_consultation", "completed"];

const EMPTY_COPY: Record<Tab, { title: string; body: string }> = {
  Upcoming: {
    title: "No upcoming appointments",
    body: "When you book a visit, it will appear here with its details and QR code.",
  },
  Completed: { title: "No completed visits yet", body: "Finished and checked-out visits will appear here." },
  Cancelled: { title: "No cancelled appointments", body: "Cancelled or missed appointments will appear here." },
};

const TABS = ["Upcoming", "Completed", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: PatientAppointment[] };

export function AppointmentsClient({ mfId }: { mfId: string | null }) {
  const [tab, setTab] = useState<Tab>("Upcoming");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [detailsFor, setDetailsFor] = useState<PatientAppointment | null>(null);
  const [cancelFor, setCancelFor] = useState<PatientAppointment | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<PatientAppointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function toggleWantsEarlier(appt: PatientAppointment, next: boolean) {
    const result = await setWantsEarlier(appt.id, next);
    if (result.ok) {
      setState((prev) =>
        prev.status === "ready"
          ? {
              ...prev,
              appointments: prev.appointments.map((a) =>
                a.id === appt.id ? { ...a, wantsEarlier: next } : a,
              ),
            }
          : prev,
      );
    } else {
      setToast({ tone: "error", message: "We couldn't save that. Please try again." });
      window.setTimeout(() => setToast(null), 4000);
    }
  }

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
      return ["rejected", "cancelled", "no_show"].includes(a.status);
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
    <PatientPage width="default">
      <PatientPageHeader
        title="My Appointments"
        meta={mfId ? `MF ID ${mfId}` : undefined}
        description="Your visits by stage. Checked-out visits appear under Completed."
        tour={PATIENT_TOURS.appointments}
        actions={
          <Button variant="secondary" href="/patient/booking">
            Book Another
          </Button>
        }
      />

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Appointment filters" data-tour="appts-tabs">
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
          icon={<CalendarIcon />}
          title={EMPTY_COPY[tab].title}
          body={EMPTY_COPY[tab].body}
          action={
            tab === "Upcoming" ? (
              <Button variant="primary" href="/patient/booking">
                Book an Appointment
              </Button>
            ) : undefined
          }
        />
      )}
      {state.status === "ready" && visible.length > 0 && (
        <div className={styles.list} data-tour="appts-list">
          {visible.map((appt, i) => {
            const cancellable = CANCELLABLE_STATUSES.includes(appt.status);
            return (
              <div key={appt.id} data-tour={i === 0 ? "appts-actions" : undefined}>
                <AppointmentListCard
                  appointment={appt}
                  onViewDetails={() => setDetailsFor(appt)}
                  onCancel={() => setCancelFor(appt)}
                  onReschedule={() => setRescheduleFor(appt)}
                  cancellable={tab === "Upcoming" && cancellable}
                  reschedulable={tab === "Upcoming" && cancellable}
                  qrHref={
                    QR_ACTIVE.includes(appt.status)
                      ? `/patient/qr?ref=${encodeURIComponent(appt.reference)}`
                      : undefined
                  }
                  onToggleWantsEarlier={
                    tab === "Upcoming" ? (next) => void toggleWantsEarlier(appt, next) : undefined
                  }
                />
              </div>
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
            <p>
              <strong>Status:</strong> {DB_STATUS_LABEL[detailsFor.status]}
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
    </PatientPage>
  );
}
