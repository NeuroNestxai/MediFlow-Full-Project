"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { UsersIcon } from "@/components/ui/Icons";
import {
  fetchStaffAppointments,
  checkInAppointment,
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
import styles from "./ReceptionPatients.module.css";

const CHECK_IN_ELIGIBLE: DbAppointmentStatus[] = ["scheduled", "confirmed"];
const IN_CLINIC = new Set(["checked_in", "waiting", "in_consultation"]);

interface PatientRow {
  patientId: string;
  name: string;
  phone: string | null;
  appointments: StaffAppointment[];
  nextAppt: StaffAppointment | null;
  latestStatus: DbAppointmentStatus;
  checkedIn: boolean;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[] };

type ToastState = { tone: "success" | "error" | "info"; message: string } | null;

function buildRows(appointments: StaffAppointment[], today: string): PatientRow[] {
  const map = new Map<string, PatientRow>();
  for (const a of appointments) {
    let row = map.get(a.patientId);
    if (!row) {
      row = {
        patientId: a.patientId,
        name: a.patientName,
        phone: a.patientPhone,
        appointments: [],
        nextAppt: null,
        latestStatus: a.status,
        checkedIn: false,
      };
      map.set(a.patientId, row);
    }
    row.appointments.push(a);
    if (a.patientPhone && !row.phone) row.phone = a.patientPhone;
  }
  const rows = Array.from(map.values());
  for (const row of rows) {
    row.appointments.sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
    );
    const active = row.appointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
    row.nextAppt = active.find((a) => a.date >= today) ?? active[active.length - 1] ?? null;
    row.checkedIn = row.appointments.some((a) => IN_CLINIC.has(a.status));
    const inClinicAppt = row.appointments.find((a) => IN_CLINIC.has(a.status));
    row.latestStatus = (inClinicAppt ?? row.nextAppt ?? row.appointments[0])?.status ?? row.latestStatus;
  }
  rows.sort((a, b) => {
    if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1;
    const aDate = a.nextAppt?.date ?? "9999-99-99";
    const bDate = b.nextAppt?.date ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export function ReceptionPatients() {
  const searchParams = useSearchParams();
  const deepLinkAppt = searchParams.get("appointment");

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const deepLinkHandled = useRef(false);
  const activeRef = useRef(true);
  const today = useMemo(() => localToday(), []);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: "loading" });
    fetchStaffAppointments({})
      .then((appointments) => {
        if (activeRef.current) setState({ status: "ready", appointments });
      })
      .catch(() => {
        if (activeRef.current) setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    const unsub = subscribeToAppointments(() => load(false));
    return () => {
      activeRef.current = false;
      unsub();
    };
  }, [load]);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    return buildRows(state.appointments, today);
  }, [state, today]);

  // Deep link: select the patient of the appointment named in the URL, once.
  useEffect(() => {
    if (deepLinkHandled.current || state.status !== "ready" || !deepLinkAppt) return;
    const appt = state.appointments.find((a) => a.id === deepLinkAppt);
    if (appt) {
      deepLinkHandled.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(appt.patientId);
    }
  }, [state, deepLinkAppt]);

  const filtered = useMemo(() => {
    let list = rows;
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          (r.phone ?? "").toLowerCase().includes(term) ||
          r.appointments.some((a) => a.reference.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [rows, query]);

  const selected = useMemo(
    () => rows.find((r) => r.patientId === selectedId) ?? null,
    [rows, selectedId],
  );

  async function onCheckIn(appt: StaffAppointment) {
    if (busyId) return;
    setBusyId(appt.id);
    const result = await checkInAppointment(appt.id);
    if (!activeRef.current) return;
    setBusyId(null);
    if (result.ok) {
      showToast("success", `${appt.patientName} checked in (${result.reference}).`);
      load(false);
    } else {
      showToast(
        "error",
        result.reason === "not_allowed"
          ? "That appointment can't be checked in from its current status."
          : result.reason === "not_found"
            ? "That appointment could not be found."
            : "Something went wrong. Nothing was changed — please try again.",
      );
    }
  }

  return (
    <div className={styles.wrap}>
      {toast ? <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}

      <div className={styles.controls}>
        <label className={styles.field}>
          <span className="sr-only">Search by name, phone or booking reference</span>
          <input
            className={styles.search}
            type="search"
            placeholder="Search name, phone or booking reference…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button variant="secondary" href="/reception/check-in">
          Check-In Workspace
        </Button>
      </div>

      <p className={styles.privacyNote}>
        Reception sees operational details only — name, contact, appointments and status. Consultation
        notes and clinical documents are never shown here.
      </p>

      {state.status === "loading" && <LoadingState label="Loading patients…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "ready" && filtered.length === 0 && (
        <EmptyState
          icon={<UsersIcon />}
          title={rows.length === 0 ? "No patients yet" : "No patients match"}
          body={
            rows.length === 0
              ? "Patients appear here once they have an appointment at the clinic."
              : "Try a different search term."
          }
        />
      )}

      {state.status === "ready" && filtered.length > 0 && (
        <div className={styles.split}>
          <ul className={styles.list} aria-label="Patients">
            {filtered.map((r) => (
              <li key={r.patientId}>
                <button
                  type="button"
                  className={`${styles.row} ${selectedId === r.patientId ? styles.rowActive : ""}`}
                  aria-pressed={selectedId === r.patientId}
                  onClick={() => setSelectedId(r.patientId)}
                >
                  <div className={styles.rowMain}>
                    <span className={styles.name}>{r.name}</span>
                    <span className={styles.meta}>{r.phone ?? "No phone on file"}</span>
                    <span className={styles.meta}>
                      {r.nextAppt
                        ? `${formatDate(r.nextAppt.date)} · ${formatTime(r.nextAppt.time)} · Ref ${r.nextAppt.reference}`
                        : "No appointments"}
                    </span>
                  </div>
                  <StatusBadge tone={DB_STATUS_TONE[r.latestStatus]} label={DB_STATUS_LABEL[r.latestStatus]} />
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.detail} aria-live="polite">
            {selected ? (
              <PatientDetail
                row={selected}
                busyId={busyId}
                onCheckIn={onCheckIn}
                highlightAppt={deepLinkAppt}
              />
            ) : (
              <div className={styles.detailEmpty}>
                <p className={styles.detailEmptyText}>Select a patient to see their appointments.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PatientDetail({
  row,
  busyId,
  onCheckIn,
  highlightAppt,
}: {
  row: PatientRow;
  busyId: string | null;
  onCheckIn: (appt: StaffAppointment) => void;
  highlightAppt: string | null;
}) {
  return (
    <div className={styles.detailCard}>
      <div className={styles.detailHead}>
        <div>
          <h2 className={styles.detailName}>{row.name}</h2>
          <p className={styles.detailMeta}>{row.phone ?? "No phone on file"}</p>
        </div>
        <StatusBadge tone={DB_STATUS_TONE[row.latestStatus]} label={DB_STATUS_LABEL[row.latestStatus]} />
      </div>

      <div className={styles.detailActions}>
        <Button variant="secondary" href={`/reception/booking?patientId=${row.patientId}`}>
          Book Appointment
        </Button>
      </div>

      <h3 className={styles.sectionTitle}>Appointment history</h3>
      <ul className={styles.timeline}>
        {row.appointments
          .slice()
          .reverse()
          .map((a) => (
            <li
              key={a.id}
              className={`${styles.timelineRow} ${highlightAppt === a.id ? styles.timelineHighlight : ""}`}
            >
              <div className={styles.timelineWhen}>
                <span className={styles.timelineDate}>{formatDate(a.date)}</span>
                <span className={styles.timelineTime}>{formatTime(a.time)}</span>
              </div>
              <div className={styles.timelineBody}>
                <span className={styles.timelineService}>{a.serviceName ?? "Service"}</span>
                <span className={styles.timelineMeta}>
                  {displayDoctorName(a.doctorName)} · Ref {a.reference}
                </span>
              </div>
              <div className={styles.timelineSide}>
                <StatusBadge tone={DB_STATUS_TONE[a.status]} label={DB_STATUS_LABEL[a.status]} />
                {CHECK_IN_ELIGIBLE.includes(a.status) ? (
                  <Button
                    variant="primary"
                    onClick={() => onCheckIn(a)}
                    disabled={busyId === a.id}
                    aria-busy={busyId === a.id}
                  >
                    {busyId === a.id ? "Checking in…" : "Check In"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
