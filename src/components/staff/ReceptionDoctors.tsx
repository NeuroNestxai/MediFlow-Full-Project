"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { StethoscopeIcon } from "@/components/ui/Icons";
import {
  fetchStaffAppointments,
  fetchClinicAvailability,
  subscribeToAppointments,
  type ClinicSlot,
} from "@/lib/staff/client-data";
import { fetchDoctors } from "@/lib/patient/client-data";
import type { StaffAppointment } from "@/lib/staff/types";
import type { DirectoryDoctor } from "@/lib/patient/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatDate,
  formatTime,
  toPalette,
} from "@/lib/patient/types";
import { localToday } from "@/lib/staff/dates";
import styles from "./ReceptionDoctors.module.css";

const IN_CLINIC = new Set(["checked_in", "waiting", "in_consultation"]);

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; doctors: DirectoryDoctor[]; appointments: StaffAppointment[]; slots: ClinicSlot[] };

interface DoctorBoard {
  doctor: DirectoryDoctor;
  specialty: string;
  todayCount: number;
  queueCount: number;
  nextSlot: ClinicSlot | null;
  todaysAppointments: StaffAppointment[];
}

export function ReceptionDoctors() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("all");
  const [availability, setAvailability] = useState<"all" | "available" | "busy">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeRef = useRef(true);
  const today = useMemo(() => localToday(), []);

  const load = useCallback(
    (showSpinner: boolean) => {
      if (showSpinner) setState({ status: "loading" });
      Promise.all([
        fetchDoctors(),
        fetchStaffAppointments({}),
        fetchClinicAvailability(today),
      ])
        .then(([doctors, appointments, slots]) => {
          if (activeRef.current) setState({ status: "ready", doctors, appointments, slots });
        })
        .catch(() => {
          if (activeRef.current) setState({ status: "error" });
        });
    },
    [today],
  );

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

  const boards = useMemo<DoctorBoard[]>(() => {
    if (state.status !== "ready") return [];
    const { doctors, appointments, slots } = state;

    // Booked slots (non-cancelled) so "next available" never shows a taken slot.
    const booked = new Set(
      appointments
        .filter((a) => a.status !== "cancelled")
        .map((a) => `${a.doctorId}|${a.date}|${a.time}`),
    );

    return doctors.map((doctor) => {
      const mine = appointments.filter((a) => a.doctorId === doctor.id);
      const todays = mine
        .filter((a) => a.date === today && a.status !== "cancelled")
        .sort((a, b) => a.time.localeCompare(b.time));
      const nextSlot =
        slots.find(
          (s) => s.doctorId === doctor.id && !booked.has(`${s.doctorId}|${s.date}|${s.time}`),
        ) ?? null;
      return {
        doctor,
        specialty: doctor.specialties.map((s) => s.name).join(" · ") || "General",
        todayCount: todays.length,
        queueCount: todays.filter((a) => IN_CLINIC.has(a.status)).length,
        nextSlot,
        todaysAppointments: todays,
      };
    });
  }, [state, today]);

  const specialties = useMemo(() => {
    const set = new Set<string>();
    boards.forEach((b) => b.doctor.specialties.forEach((s) => set.add(s.name)));
    return Array.from(set).sort();
  }, [boards]);

  const filtered = useMemo(() => {
    let list = boards;
    if (specialty !== "all") {
      list = list.filter((b) => b.doctor.specialties.some((s) => s.name === specialty));
    }
    if (availability === "available") list = list.filter((b) => b.nextSlot !== null);
    if (availability === "busy") list = list.filter((b) => b.queueCount > 0);
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (b) =>
          b.doctor.fullName.toLowerCase().includes(term) ||
          b.specialty.toLowerCase().includes(term),
      );
    }
    return list;
  }, [boards, specialty, availability, query]);

  const selected = useMemo(
    () => filtered.find((b) => b.doctor.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span className="sr-only">Search doctors</span>
          <input
            className={styles.search}
            type="search"
            placeholder="Search doctor or specialty…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className="sr-only">Filter by specialty</span>
          <select
            className={styles.select}
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            aria-label="Filter by specialty"
          >
            <option value="all">All specialties</option>
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="sr-only">Filter by availability</span>
          <select
            className={styles.select}
            value={availability}
            onChange={(e) => setAvailability(e.target.value as "all" | "available" | "busy")}
            aria-label="Filter by availability"
          >
            <option value="all">Any availability</option>
            <option value="available">Has open slots</option>
            <option value="busy">Currently with patients</option>
          </select>
        </label>
      </div>

      {state.status === "loading" && <LoadingState label="Loading the clinic team…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "ready" && filtered.length === 0 && (
        <EmptyState
          icon={<StethoscopeIcon />}
          title="No doctors match"
          body="Try a different search or filter."
        />
      )}

      {state.status === "ready" && filtered.length > 0 && (
        <div className={styles.split}>
          <ul className={styles.list} aria-label="Doctors">
            {filtered.map((b) => (
              <li key={b.doctor.id}>
                <button
                  type="button"
                  className={`${styles.row} ${selectedId === b.doctor.id ? styles.rowActive : ""}`}
                  aria-pressed={selectedId === b.doctor.id}
                  onClick={() => setSelectedId(b.doctor.id)}
                >
                  <DoctorPortrait palette={toPalette(b.doctor.portraitPalette)} size={44} />
                  <div className={styles.rowMain}>
                    <span className={styles.name}>{displayDoctorName(b.doctor.fullName)}</span>
                    <span className={styles.meta}>{b.specialty}</span>
                    <span className={styles.meta}>
                      {b.nextSlot
                        ? `Next free: ${formatDate(b.nextSlot.date)} · ${formatTime(b.nextSlot.time)}`
                        : "No open slots in range"}
                    </span>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.count}>{b.todayCount} today</span>
                    {b.queueCount > 0 ? (
                      <StatusBadge tone="pending" label={`${b.queueCount} in clinic`} />
                    ) : (
                      <StatusBadge tone={b.nextSlot ? "success" : "neutral"} label={b.nextSlot ? "Available" : "Full"} />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.detail} aria-live="polite">
            {selected ? (
              <DoctorDetail board={selected} />
            ) : (
              <div className={styles.detailEmpty}>
                <p className={styles.detailEmptyText}>
                  Select a doctor to see today&rsquo;s schedule and start a booking for them.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DoctorDetail({ board }: { board: DoctorBoard }) {
  return (
    <div className={styles.detailCard}>
      <div className={styles.detailHead}>
        <DoctorPortrait palette={toPalette(board.doctor.portraitPalette)} size={52} />
        <div>
          <h2 className={styles.detailName}>{displayDoctorName(board.doctor.fullName)}</h2>
          <p className={styles.detailMeta}>{board.specialty}</p>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{board.todayCount}</span>
          <span className={styles.statLabel}>Today</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{board.queueCount}</span>
          <span className={styles.statLabel}>In clinic now</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {board.nextSlot ? formatTime(board.nextSlot.time) : "—"}
          </span>
          <span className={styles.statLabel}>
            {board.nextSlot ? `Next free (${formatDate(board.nextSlot.date)})` : "No open slots"}
          </span>
        </div>
      </div>

      <div className={styles.detailActions}>
        <Button variant="primary" href={`/reception/booking?doctorId=${board.doctor.id}`}>
          Book for this doctor
        </Button>
      </div>

      <section aria-labelledby={`sched-${board.doctor.id}`}>
        <h3 id={`sched-${board.doctor.id}`} className={styles.sectionTitle}>
          Today&rsquo;s schedule
        </h3>
        {board.todaysAppointments.length === 0 ? (
          <p className={styles.detailMeta}>No appointments booked for today.</p>
        ) : (
          <ul className={styles.schedule}>
            {board.todaysAppointments.map((a) => (
              <li key={a.id} className={styles.scheduleRow}>
                <span className={styles.scheduleTime}>{formatTime(a.time)}</span>
                <div className={styles.scheduleBody}>
                  <span className={styles.schedulePatient}>{a.patientName}</span>
                  <span className={styles.scheduleService}>{a.serviceName ?? "Service"}</span>
                </div>
                <StatusBadge tone={DB_STATUS_TONE[a.status]} label={DB_STATUS_LABEL[a.status]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
