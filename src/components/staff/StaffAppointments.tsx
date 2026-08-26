"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { CalendarIcon } from "@/components/ui/Icons";
import {
  fetchStaffAppointments,
  checkInAppointment,
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
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import { localToday } from "@/lib/staff/dates";
import styles from "./StaffAppointments.module.css";

type Scope = "today" | "upcoming" | "all";
type Group = "all" | "pending_approval" | "in_clinic" | "upcoming" | "completed" | "cancelled";

const GROUPS: { value: Group; label: string; statuses: DbAppointmentStatus[] | null }[] = [
  { value: "all", label: "All", statuses: null },
  { value: "pending_approval", label: "Pending approval", statuses: ["pending_approval"] },
  { value: "in_clinic", label: "In clinic", statuses: ["checked_in", "waiting", "in_consultation"] },
  { value: "upcoming", label: "Scheduled", statuses: ["scheduled", "confirmed"] },
  { value: "completed", label: "Completed", statuses: ["completed", "checked_out"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled", "no_show", "rejected"] },
];

const CHECK_IN_ELIGIBLE: DbAppointmentStatus[] = ["scheduled", "confirmed"];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[] };

export interface StaffAppointmentsProps {
  role: "doctor" | "reception";
  /** Restrict to today's date only (Doctor Schedule), otherwise today+upcoming. */
  defaultScope?: Scope;
  /** Show the Today / Upcoming / All scope switch. */
  showScope?: boolean;
}

export function StaffAppointments({
  role,
  defaultScope = "all",
  showScope = true,
}: StaffAppointmentsProps) {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") as DbAppointmentStatus | null;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<StaffAppointment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const activeRef = useRef(true);
  const today = useMemo(() => localToday(), []);

  const showToast = useCallback((tone: "success" | "error" | "info", msg: string) => {
    setToast({ tone, message: msg });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(
    (showSpinner: boolean) => {
      if (showSpinner) setState({ status: "loading" });
      const q = scope === "today" ? { date: today } : {};
      fetchStaffAppointments(q)
        .then((appointments) => {
          if (activeRef.current) setState({ status: "ready", appointments });
        })
        .catch(() => {
          if (activeRef.current) setState({ status: "error" });
        });
    },
    [scope, today],
  );

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    const unsubscribe = subscribeToAppointments(() => load(false));
    return () => {
      activeRef.current = false;
      unsubscribe();
    };
  }, [load]);

  const rows = useMemo(() => {
    const all = state.status === "ready" ? state.appointments : [];
    const groupDef = GROUPS.find((g) => g.value === group);
    let filtered = groupDef?.statuses ? all.filter((a) => groupDef.statuses!.includes(a.status)) : all;
    if (scope === "upcoming") filtered = filtered.filter((a) => a.date >= today);
    const term = query.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter(
        (a) =>
          a.patientName.toLowerCase().includes(term) ||
          a.reference.toLowerCase().includes(term) ||
          (a.serviceName ?? "").toLowerCase().includes(term),
      );
    }
    if (statusParam) {
      filtered = filtered.filter((a) => a.status === statusParam);
    }
    return filtered;
  }, [state, group, scope, query, today, statusParam]);

  async function onCheckIn(appt: StaffAppointment) {
    if (busyId) return;
    setBusyId(appt.id);
    setMessage(null);
    const result = await checkInAppointment(appt.id);
    if (!activeRef.current) return;
    if (result.ok) {
      setMessage(`Checked in ${appt.patientName} (${result.reference}).`);
      load(false);
    } else {
      setMessage(
        result.reason === "not_allowed"
          ? "That appointment can't be checked in from its current status."
          : result.reason === "not_found"
            ? "That appointment could not be found."
            : "Something went wrong. Nothing was changed -- please try again.",
      );
    }
    setBusyId(null);
  }

  function approvalErrorMessage(reason: "mfa_required" | "not_allowed" | "not_found" | "error"): string {
    switch (reason) {
      case "mfa_required":
        return "Your account needs two-factor authentication turned on before you can approve or reject bookings. Set it up in your account security settings, then try again.";
      case "not_allowed":
        return "This request can no longer be approved or rejected -- it may have already been handled.";
      case "not_found":
        return "That appointment is no longer available.";
      default:
        return "Something went wrong. Nothing was changed -- please try again.";
    }
  }

  async function onApprove(appt: StaffAppointment) {
    if (busyId) return;
    setBusyId(appt.id);
    const result = await approveAppointment(appt.id);
    setBusyId(null);
    if (result.ok) {
      showToast("success", `${result.reference} approved and confirmed.`);
      load(false);
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
      load(false);
      return;
    }
    showToast("error", approvalErrorMessage(result.reason));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        {showScope ? (
          <div className={styles.scopeSwitch} role="group" aria-label="Date range">
            {(["today", "upcoming", "all"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.scopeBtn} ${scope === s ? styles.scopeActive : ""}`}
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
              >
                {s === "today" ? "Today" : s === "upcoming" ? "Upcoming" : "All"}
              </button>
            ))}
          </div>
        ) : null}

        <label className={styles.field}>
          <span className="sr-only">Filter by status</span>
          <select
            className={styles.select}
            value={group}
            onChange={(e) => setGroup(e.target.value as Group)}
            aria-label="Filter by status"
          >
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className="sr-only">Search by name, reference or service</span>
          <input
            className={styles.search}
            type="search"
            placeholder="Search name, reference or service..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      {message ? (
        <p className={styles.message} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      {state.status === "loading" && <LoadingState label="Loading appointments..." />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "ready" && rows.length === 0 && (
        <EmptyState
          icon={<CalendarIcon />}
          title="No appointments match"
          body="Try a different date range, status filter or search term."
        />
      )}

      {state.status === "ready" && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((appt) => (
            <li key={appt.id} className={styles.row}>
              <div className={styles.when}>
                <span className={styles.time}>{formatTime(appt.time)}</span>
                <span className={styles.date}>{formatDate(appt.date)}</span>
              </div>
              <div className={styles.who}>
                <span className={styles.patient}>{appt.patientName}</span>
                <span className={styles.meta}>
                  {appt.serviceName ?? "Service"} - {displayDoctorName(appt.doctorName)}
                </span>
                <span className={styles.ref}>
                  Ref {appt.reference}
                  {appt.patientMfId ? ` - ${appt.patientMfId}` : ""}
                </span>
              </div>
              <StatusBadge tone={DB_STATUS_TONE[appt.status]} label={DB_STATUS_LABEL[appt.status]} />
              <div className={styles.rowActions}>
                <Button
                  variant="secondary"
                  href={
                    role === "doctor"
                      ? `/doctor/patient-summary?appointment=${appt.id}`
                      : `/reception/patients?appointment=${appt.id}`
                  }
                >
                  Details
                </Button>
                {role === "doctor" && ["checked_in", "waiting"].includes(appt.status) ? (
                  <Button variant="primary" href={`/doctor/consultation?appointment=${appt.id}`}>
                    Open
                  </Button>
                ) : null}
                {role === "reception" && CHECK_IN_ELIGIBLE.includes(appt.status) ? (
                  <Button
                    variant="primary"
                    onClick={() => void onCheckIn(appt)}
                    disabled={busyId === appt.id}
                    aria-busy={busyId === appt.id}
                  >
                    {busyId === appt.id ? "Checking in..." : "Check In"}
                  </Button>
                ) : null}
                {role === "reception" && appt.status === "pending_approval" ? (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => void onApprove(appt)}
                      disabled={busyId === appt.id}
                      aria-busy={busyId === appt.id}
                    >
                      {busyId === appt.id ? "Working..." : "Approve"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => openReject(appt)}
                      disabled={busyId === appt.id}
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reject this booking request?"
        description={
          rejectTarget
            ? `${rejectTarget.patientName} - ${rejectTarget.reference}. The patient will be notified.`
            : undefined
        }
      >
        <FormField label="Reason (optional)" htmlFor="staff-appts-reject-reason">
          {({ describedBy }) => (
            <Textarea
              id="staff-appts-reject-reason"
              rows={3}
              placeholder="Shown to the patient -- e.g. requested time is no longer available."
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
    </div>
  );
}