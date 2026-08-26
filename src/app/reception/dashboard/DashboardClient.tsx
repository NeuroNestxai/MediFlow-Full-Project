"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { FormField } from "@/components/ui/FormField";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import {
  fetchStaffAppointments,
  checkOutAppointment,
  approveAppointment,
  rejectAppointment,
  fetchPendingSlotOffers,
  approveSlotOffer,
  rejectSlotOffer,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import type { StaffAppointment, StaffSlotOffer } from "@/lib/staff/types";
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
  | { status: "ready"; appointments: StaffAppointment[] };

type OfferLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; offers: StaffSlotOffer[] };

/** Statuses that mean the patient has not arrived yet — the "next arrivals" list. */
const UPCOMING_STATUSES = new Set(["scheduled", "confirmed"]);

export function DashboardClient({ displayName }: { displayName: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<StaffAppointment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [offerState, setOfferState] = useState<OfferLoadState>({ status: "loading" });
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);
  const [offerRejectTarget, setOfferRejectTarget] = useState<StaffSlotOffer | null>(null);
  const [offerRejectReason, setOfferRejectReason] = useState("");

  const today = useMemo(() => localToday(), []);
  const todayLabel = useMemo(() => formatLongLocalDate(), []);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    fetchStaffAppointments({})
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

  useEffect(() => {
    let active = true;
    fetchPendingSlotOffers()
      .then((offers) => {
        if (active) setOfferState({ status: "ready", offers });
      })
      .catch(() => {
        if (active) setOfferState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const pendingOffers = useMemo(
    () => (offerState.status === "ready" ? offerState.offers : []),
    [offerState],
  );

  function slotOfferErrorMessage(reason: "mfa_required" | "not_allowed" | "not_found" | "error"): string {
    switch (reason) {
      case "mfa_required":
        return "Your account needs two-factor authentication turned on before you can approve or reject this. Set it up in your account security settings, then try again.";
      case "not_allowed":
        return "This request can no longer be approved or rejected — the slot may already be taken, or it was already handled.";
      case "not_found":
        return "That request is no longer available.";
      default:
        return "Something went wrong. Nothing was changed — please try again.";
    }
  }

  async function approveOffer(offer: StaffSlotOffer) {
    setOfferBusyId(offer.offerId);
    const result = await approveSlotOffer(offer.offerId);
    setOfferBusyId(null);
    if (result.ok) {
      showToast("success", `${offer.reference} moved to the earlier slot.`);
      reload();
      return;
    }
    showToast("error", slotOfferErrorMessage(result.reason));
  }

  function openOfferReject(offer: StaffSlotOffer) {
    setOfferRejectTarget(offer);
    setOfferRejectReason("");
  }

  async function confirmOfferReject() {
    if (!offerRejectTarget) return;
    setOfferBusyId(offerRejectTarget.offerId);
    const result = await rejectSlotOffer(offerRejectTarget.offerId, offerRejectReason);
    setOfferBusyId(null);
    setOfferRejectTarget(null);
    if (result.ok) {
      showToast("info", `${offerRejectTarget.reference} stays on its original time.`);
      reload();
      return;
    }
    showToast("error", slotOfferErrorMessage(result.reason));
  }

  const appointments = useMemo(
    () => (state.status === "ready" ? state.appointments : []),
    [state],
  );

  const stats = useMemo(() => {
    const count = (predicate: (a: StaffAppointment) => boolean) =>
      appointments.filter(predicate).length;
    return [
      { label: "Today's Appointments", value: appointments.filter((a) => a.date === today).length },
      { label: "Pending Approval", value: count((a) => a.status === "pending_approval") },
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

  const pendingApproval = useMemo(
    () => appointments.filter((a) => a.status === "pending_approval"),
    [appointments],
  );

  const nextArrivals = useMemo(
    () => appointments.filter((a) => UPCOMING_STATUSES.has(a.status)).slice(0, 6),
    [appointments],
  );

  const readyForCheckout = useMemo(
    () => appointments.filter((a) => a.status === "completed"),
    [appointments],
  );

  function approvalErrorMessage(reason: "mfa_required" | "not_allowed" | "not_found" | "error"): string {
    switch (reason) {
      case "mfa_required":
        return "Your account needs two-factor authentication turned on before you can approve or reject bookings. Set it up in your account security settings, then try again.";
      case "not_allowed":
        return "This request can no longer be approved or rejected — it may have already been handled.";
      case "not_found":
        return "That appointment is no longer available.";
      default:
        return "Something went wrong. Nothing was changed — please try again.";
    }
  }

  async function approve(appt: StaffAppointment) {
    setBusyId(appt.id);
    const result = await approveAppointment(appt.id);
    setBusyId(null);
    if (result.ok) {
      showToast("success", `${result.reference} approved and confirmed.`);
      reload();
      return;
    }
    showToast("error", approvalErrorMessage(result.reason));
  }

  function openReject(appt: StaffAppointment) {
    setRejectTarget(appt);
    setRejectReason("");
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    const result = await rejectAppointment(rejectTarget.id, rejectReason);
    setBusyId(null);
    setRejectTarget(null);
    if (result.ok) {
      showToast("info", `${result.reference} was rejected.`);
      reload();
      return;
    }
    showToast("error", approvalErrorMessage(result.reason));
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

          <section aria-labelledby="approvals-heading">
            <h2 id="approvals-heading" className={styles.sectionTitle}>
              Pending approvals
            </h2>
            {pendingApproval.length === 0 ? (
              <EmptyState
                title="Nothing waiting on approval"
                body="New booking requests appear here until reception approves or rejects them."
              />
            ) : (
              <ul className={styles.list}>
                {pendingApproval.map((appt) => (
                  <li key={appt.id} className={styles.row}>
                    <DoctorPortrait palette={toPalette(appt.doctorPalette)} size={44} />
                    <div className={styles.rowMain}>
                      <p className={styles.patientName}>{appt.patientName}</p>
                      <p className={styles.meta}>
                        {displayDoctorName(appt.doctorName)} &middot; {appt.serviceName || "—"} &middot;{" "}
                        {formatTime(appt.time)}
                      </p>
                      <p className={styles.ref}>
                        {appt.reference}
                        {appt.patientMfId ? ` \u00b7 ${appt.patientMfId}` : ""}
                      </p>
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
                        {busyId === appt.id ? "Working…" : "Approve"}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={busyId === appt.id}
                        onClick={() => openReject(appt)}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="earlier-heading">
            <h2 id="earlier-heading" className={styles.sectionTitle}>
              Earlier-slot requests
            </h2>
            {pendingOffers.length === 0 ? (
              <EmptyState
                title="Nothing waiting on approval"
                body="Requests to move to an earlier slot appear here once a patient accepts one."
              />
            ) : (
              <ul className={styles.list}>
                {pendingOffers.map((offer) => (
                  <li key={offer.offerId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.patientName}>{offer.patientName}</p>
                      <p className={styles.meta}>
                        {displayDoctorName(offer.doctorName ?? "Doctor")} &middot; moving from{" "}
                        {formatDate(offer.currentDate)} {formatTime(offer.currentTime)} to{" "}
                        {formatDate(offer.offerDate)} {formatTime(offer.offerTime)}
                      </p>
                      <p className={styles.ref}>
                        {offer.reference}
                        {offer.patientMfId ? ` \u00b7 ${offer.patientMfId}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone="pending" label="Accepted \u2014 Awaiting You" />
                    <div className={styles.rowActions}>
                      <Button
                        variant="primary"
                        disabled={offerBusyId === offer.offerId}
                        onClick={() => void approveOffer(offer)}
                      >
                        {offerBusyId === offer.offerId ? "Working…" : "Approve Move"}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={offerBusyId === offer.offerId}
                        onClick={() => openOfferReject(offer)}
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
                      <p className={styles.patientName}>{appt.patientName}</p>
                      <p className={styles.meta}>
                        {displayDoctorName(appt.doctorName)} &middot; {appt.serviceName || "—"} &middot;{" "}
                        {formatTime(appt.time)}
                      </p>
                      <p className={styles.ref}>
                        {appt.reference}
                        {appt.patientMfId ? ` \u00b7 ${appt.patientMfId}` : ""}
                      </p>
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
                      <p className={styles.ref}>
                        {appt.reference}
                        {appt.patientMfId ? ` \u00b7 ${appt.patientMfId}` : ""}
                      </p>
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

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reject this booking request?"
        description={
          rejectTarget
            ? `${rejectTarget.patientName} \u00b7 ${rejectTarget.reference}. The patient will be notified.`
            : undefined
        }
      >
        <FormField label="Reason (optional)" htmlFor="reject-reason">
          {({ describedBy }) => (
            <Textarea
              id="reject-reason"
              rows={3}
              placeholder="Shown to the patient — e.g. requested time is no longer available."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-describedby={describedBy}
            />
          )}
        </FormField>
        <div className={styles.rowActions} style={{ marginTop: 16 }}>
          <Button variant="destructive" onClick={() => void confirmReject()}>
            Reject Request
          </Button>
          <Button variant="tertiary" onClick={() => setRejectTarget(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={offerRejectTarget !== null}
        onClose={() => setOfferRejectTarget(null)}
        title="Reject this earlier-slot request?"
        description={
          offerRejectTarget
            ? `${offerRejectTarget.patientName} \u00b7 ${offerRejectTarget.reference}. Their original appointment stays unchanged, and the slot is offered to the next patient.`
            : undefined
        }
      >
        <FormField label="Reason (optional)" htmlFor="offer-reject-reason">
          {({ describedBy }) => (
            <Textarea
              id="offer-reject-reason"
              rows={3}
              placeholder="Shown to the patient \u2014 e.g. the earlier slot is no longer suitable."
              value={offerRejectReason}
              onChange={(e) => setOfferRejectReason(e.target.value)}
              aria-describedby={describedBy}
            />
          )}
        </FormField>
        <div className={styles.rowActions} style={{ marginTop: 16 }}>
          <Button variant="destructive" onClick={() => void confirmOfferReject()}>
            Reject Request
          </Button>
          <Button variant="tertiary" onClick={() => setOfferRejectTarget(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  );
}