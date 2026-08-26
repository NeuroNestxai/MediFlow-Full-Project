"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { StethoscopeIcon, InfoIcon } from "@/components/ui/Icons";
import { fetchDoctorConsultations } from "@/lib/staff/client-data";
import type { DoctorConsultationSummary } from "@/lib/staff/types";
import { formatDate, formatTime } from "@/lib/patient/types";
import styles from "./DoctorConsultationNotes.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; consultations: DoctorConsultationSummary[] };

type Filter = "all" | "draft" | "completed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "completed", label: "Completed" },
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function DoctorConsultationNotes() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const activeRef = useRef(true);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: "loading" });
    fetchDoctorConsultations()
      .then((result) => {
        if (!activeRef.current) return;
        if (result.status === "ready") setState({ status: "ready", consultations: result.consultations });
        else setState({ status: result.status });
      })
      .catch(() => {
        if (activeRef.current) setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    let list = state.consultations;
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (c) =>
          c.patientName.toLowerCase().includes(term) ||
          c.reference.toLowerCase().includes(term) ||
          (c.serviceName ?? "").toLowerCase().includes(term) ||
          c.date.includes(term),
      );
    }
    return list;
  }, [state, filter, query]);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <div className={styles.filters} role="group" aria-label="Filter consultations">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.filterBtn} ${filter === f.value ? styles.filterActive : ""}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className={styles.field}>
          <span className="sr-only">Search by patient, reference, service or date</span>
          <input
            className={styles.search}
            type="search"
            placeholder="Search patient, reference, service or date…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {state.status === "loading" && <LoadingState label="Loading your consultations…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "unavailable" && (
        <EmptyState
          icon={<InfoIcon />}
          title="Consultation records are not enabled yet"
          body="The consultation workspace has not been switched on for this clinic database yet. Once the database update is applied, your consultations will appear here."
        />
      )}
      {state.status === "ready" && rows.length === 0 && (
        <EmptyState
          icon={<StethoscopeIcon />}
          title={
            state.consultations.length === 0 ? "No consultations yet" : "No consultations match"
          }
          body={
            state.consultations.length === 0
              ? "A consultation record is created when you open a checked-in patient. Start one from your Schedule."
              : "Try a different filter or search term."
          }
          action={
            state.consultations.length === 0 ? (
              <Button variant="primary" href="/doctor/schedule">
                Go to Schedule
              </Button>
            ) : undefined
          }
        />
      )}

      {state.status === "ready" && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((c) => (
            <li key={c.id} className={styles.row}>
              <div className={styles.when}>
                <span className={styles.date}>{c.date ? formatDate(c.date) : "—"}</span>
                <span className={styles.time}>{c.time ? formatTime(c.time) : ""}</span>
              </div>
              <div className={styles.who}>
                <span className={styles.patient}>{c.patientName}</span>
                <span className={styles.meta}>
                  {c.serviceName ?? "Service"} · Ref {c.reference}
                </span>
                <span className={styles.updated}>
                  {c.hasNotes ? "Notes saved" : "No notes yet"} · updated {relativeTime(c.updatedAt)}
                </span>
              </div>
              <StatusBadge
                tone={c.status === "completed" ? "success" : "pending"}
                label={c.status === "completed" ? "Completed" : "Draft"}
              />
              <div className={styles.actions}>
                <Button variant={c.status === "completed" ? "secondary" : "primary"} href={`/doctor/consultation?appointment=${c.appointmentId}`}>
                  {c.status === "completed" ? "View Notes" : "Continue Editing"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.status === "ready" && rows.length > 0 ? (
        <p className={styles.footnote}>
          Completed consultations are read-only. No diagnosis, prescription or triage is generated —
          notes are free text written by you.
        </p>
      ) : null}
    </div>
  );
}
