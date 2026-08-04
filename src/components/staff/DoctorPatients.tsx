"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { UsersIcon } from "@/components/ui/Icons";
import {
  fetchStaffAppointments,
  fetchFollowUps,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import {
  FOLLOW_UP_TYPE_LABEL,
  type FollowUp,
  type StaffAppointment,
} from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  formatDate,
  formatTime,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import { localToday } from "@/lib/staff/dates";
import styles from "./DoctorPatients.module.css";

const IN_CLINIC: DbAppointmentStatus[] = ["checked_in", "waiting", "in_consultation"];
const CONSULTABLE: DbAppointmentStatus[] = ["checked_in", "waiting"];
const DONE: DbAppointmentStatus[] = ["completed", "checked_out"];

interface PatientRow {
  patientId: string;
  name: string;
  phone: string | null;
  appointments: StaffAppointment[];
  followUps: FollowUp[];
  nextAppt: StaffAppointment | null;
  recentAppt: StaffAppointment | null;
  latestStatus: DbAppointmentStatus;
  hasUpcoming: boolean;
  hasPrevious: boolean;
  followUpDue: boolean;
  inClinic: boolean;
  consultationCompleted: boolean;
}

type Filter =
  | "all"
  | "upcoming"
  | "previous"
  | "follow_up_due"
  | "in_clinic"
  | "completed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All patients" },
  { value: "in_clinic", label: "Checked-in / waiting" },
  { value: "upcoming", label: "Upcoming appointment" },
  { value: "previous", label: "Previous appointment" },
  { value: "follow_up_due", label: "Follow-up due" },
  { value: "completed", label: "Consultation completed" },
];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: StaffAppointment[]; followUps: FollowUp[] };

function buildRows(appointments: StaffAppointment[], followUps: FollowUp[], today: string): PatientRow[] {
  const byPatient = new Map<string, PatientRow>();

  for (const appt of appointments) {
    let row = byPatient.get(appt.patientId);
    if (!row) {
      row = {
        patientId: appt.patientId,
        name: appt.patientName,
        phone: appt.patientPhone,
        appointments: [],
        followUps: [],
        nextAppt: null,
        recentAppt: null,
        latestStatus: appt.status,
        hasUpcoming: false,
        hasPrevious: false,
        followUpDue: false,
        inClinic: false,
        consultationCompleted: false,
      };
      byPatient.set(appt.patientId, row);
    }
    row.appointments.push(appt);
    if (appt.patientPhone && !row.phone) row.phone = appt.patientPhone;
  }

  for (const f of followUps) {
    const row = byPatient.get(f.patientId);
    if (row) row.followUps.push(f);
  }

  const rows = Array.from(byPatient.values());
  for (const row of rows) {
    // Sort appointments chronologically (soonest first).
    row.appointments.sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
    );

    const active = row.appointments.filter(
      (a) => a.status !== "cancelled" && a.status !== "no_show",
    );
    row.nextAppt =
      active.find((a) => a.date >= today && !DONE.includes(a.status)) ?? null;
    // Most recent by date (last in the sorted list, preferring a real visit).
    row.recentAppt = row.appointments[row.appointments.length - 1] ?? null;
    const past = active.filter((a) => a.date < today || DONE.includes(a.status));
    if (past.length) row.recentAppt = past[past.length - 1];

    row.inClinic = row.appointments.some((a) => IN_CLINIC.includes(a.status));
    row.hasUpcoming = Boolean(row.nextAppt);
    row.hasPrevious = past.length > 0;
    row.consultationCompleted = row.appointments.some((a) => DONE.includes(a.status));
    row.followUpDue = row.followUps.some((f) => f.status !== "completed" && f.dueDate <= today);

    // Badge reflects the most operationally relevant status: in-clinic first,
    // else the next upcoming, else the most recent.
    const inClinicAppt = row.appointments.find((a) => IN_CLINIC.includes(a.status));
    row.latestStatus = (inClinicAppt ?? row.nextAppt ?? row.recentAppt)?.status ?? row.latestStatus;
  }

  // Order: patients currently in clinic first, then by soonest upcoming, then name.
  rows.sort((a, b) => {
    if (a.inClinic !== b.inClinic) return a.inClinic ? -1 : 1;
    const aDate = a.nextAppt?.date ?? "9999-99-99";
    const bDate = b.nextAppt?.date ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export function DoctorPatients() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeRef = useRef(true);
  const today = useMemo(() => localToday(), []);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: "loading" });
    Promise.all([fetchStaffAppointments({}), fetchFollowUps().catch(() => [] as FollowUp[])])
      .then(([appointments, followUps]) => {
        if (activeRef.current) setState({ status: "ready", appointments, followUps });
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
    return buildRows(state.appointments, state.followUps, today);
  }, [state, today]);

  const filtered = useMemo(() => {
    let list = rows;
    switch (filter) {
      case "upcoming":
        list = list.filter((r) => r.hasUpcoming);
        break;
      case "previous":
        list = list.filter((r) => r.hasPrevious);
        break;
      case "follow_up_due":
        list = list.filter((r) => r.followUpDue);
        break;
      case "in_clinic":
        list = list.filter((r) => r.inClinic);
        break;
      case "completed":
        list = list.filter((r) => r.consultationCompleted);
        break;
    }
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.appointments.some((a) => a.reference.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [rows, filter, query]);

  const selected = useMemo(
    () => filtered.find((r) => r.patientId === selectedId) ?? null,
    [filtered, selectedId],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span className="sr-only">Filter patients</span>
          <select
            className={styles.select}
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter patients"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="sr-only">Search by patient name or booking reference</span>
          <input
            className={styles.search}
            type="search"
            placeholder="Search name or booking reference…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {state.status === "loading" && <LoadingState label="Loading your patients…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "ready" && filtered.length === 0 && (
        <EmptyState
          icon={<UsersIcon />}
          title={rows.length === 0 ? "No patients yet" : "No patients match"}
          body={
            rows.length === 0
              ? "Patients appear here once they have an appointment, consultation or follow-up with you."
              : "Try a different filter or search term."
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
                    <span className={styles.meta}>
                      {r.nextAppt
                        ? `Next: ${formatDate(r.nextAppt.date)} · ${formatTime(r.nextAppt.time)}`
                        : r.recentAppt
                          ? `Last: ${formatDate(r.recentAppt.date)}`
                          : "No appointments"}
                    </span>
                    <span className={styles.meta}>
                      {(r.nextAppt ?? r.recentAppt)?.serviceName ?? "Service not recorded"}
                    </span>
                  </div>
                  <div className={styles.rowSide}>
                    <StatusBadge tone={DB_STATUS_TONE[r.latestStatus]} label={DB_STATUS_LABEL[r.latestStatus]} />
                    {r.followUpDue ? <span className={styles.flag}>Follow-up due</span> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.detail} aria-live="polite">
            {selected ? (
              <PatientDetail row={selected} />
            ) : (
              <div className={styles.detailEmpty}>
                <p className={styles.detailEmptyText}>Select a patient to see their appointments and follow-ups.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PatientDetail({ row }: { row: PatientRow }) {
  const openable = row.appointments.find((a) => CONSULTABLE.includes(a.status));
  const summaryAppt = openable ?? row.nextAppt ?? row.recentAppt;

  return (
    <div className={styles.detailCard}>
      <div className={styles.detailHead}>
        <h2 className={styles.detailName}>{row.name}</h2>
        <StatusBadge tone={DB_STATUS_TONE[row.latestStatus]} label={DB_STATUS_LABEL[row.latestStatus]} />
      </div>
      {row.phone ? <p className={styles.detailMeta}>{row.phone}</p> : null}

      <div className={styles.detailActions}>
        {summaryAppt ? (
          <Button variant="secondary" href={`/doctor/patient-summary?appointment=${summaryAppt.id}`}>
            Open Summary
          </Button>
        ) : null}
        {openable ? (
          <Button variant="primary" href={`/doctor/consultation?appointment=${openable.id}`}>
            Start Consultation
          </Button>
        ) : null}
      </div>

      <section className={styles.section} aria-labelledby={`appts-${row.patientId}`}>
        <div className={styles.sectionHead}>
          <h3 id={`appts-${row.patientId}`} className={styles.sectionTitle}>
            Appointments
          </h3>
          <SourceLabel source="patient-reported" />
        </div>
        <ul className={styles.timeline}>
          {row.appointments
            .slice()
            .reverse()
            .map((a) => (
              <li key={a.id} className={styles.timelineRow}>
                <div className={styles.timelineWhen}>
                  <span className={styles.timelineDate}>{formatDate(a.date)}</span>
                  <span className={styles.timelineTime}>{formatTime(a.time)}</span>
                </div>
                <div className={styles.timelineBody}>
                  <span className={styles.timelineService}>{a.serviceName ?? "Service"}</span>
                  <span className={styles.timelineRef}>Ref {a.reference}</span>
                </div>
                <StatusBadge tone={DB_STATUS_TONE[a.status]} label={DB_STATUS_LABEL[a.status]} />
              </li>
            ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={`fu-${row.patientId}`}>
        <div className={styles.sectionHead}>
          <h3 id={`fu-${row.patientId}`} className={styles.sectionTitle}>
            Follow-ups
          </h3>
          <SourceLabel source="doctor-approved" />
        </div>
        {row.followUps.length === 0 ? (
          <p className={styles.detailMeta}>No follow-ups recorded for this patient.</p>
        ) : (
          <ul className={styles.timeline}>
            {row.followUps
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((f) => (
                <li key={f.id} className={styles.timelineRow}>
                  <div className={styles.timelineWhen}>
                    <span className={styles.timelineDate}>{formatDate(f.dueDate)}</span>
                    <span className={styles.timelineTime}>Due</span>
                  </div>
                  <div className={styles.timelineBody}>
                    <span className={styles.timelineService}>{FOLLOW_UP_TYPE_LABEL[f.followUpType]}</span>
                    <span className={styles.timelineRef}>{f.instructions}</span>
                  </div>
                  <StatusBadge
                    tone={f.status === "completed" ? "success" : f.status === "approved" ? "info" : "neutral"}
                    label={f.status === "completed" ? "Completed" : f.status === "approved" ? "Approved" : "Draft"}
                  />
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
