"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { CalendarIcon, InfoIcon, LockIcon } from "@/components/ui/Icons";
import {
  fetchDoctorAvailability,
  addDoctorAvailability,
  setDoctorAvailabilityActive,
  blockDoctorAvailability,
} from "@/lib/staff/client-data";
import type { DoctorAvailabilitySlot } from "@/lib/staff/types";
import { formatTime } from "@/lib/patient/types";
import { localToday, formatLongDate } from "@/lib/staff/dates";
import styles from "./DoctorAvailability.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; slots: DoctorAvailabilitySlot[] };

type ToastState = { tone: "success" | "error" | "info"; message: string } | null;

/** Add N days to a local YYYY-MM-DD without any timezone drift. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return localToday(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

const RANGES = [
  { value: 14, label: "Next 2 weeks" },
  { value: 28, label: "Next 4 weeks" },
] as const;

export function DoctorAvailability() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rangeDays, setRangeDays] = useState<14 | 28>(14);
  const [toast, setToast] = useState<ToastState>(null);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(true);

  const today = useMemo(() => localToday(), []);
  const to = useMemo(() => addDays(today, rangeDays), [today, rangeDays]);

  // Add-slot form.
  const [addDate, setAddDate] = useState(today);
  const [addTime, setAddTime] = useState("09:00");
  const [addError, setAddError] = useState<string | null>(null);

  // Block-range form.
  const [blockDate, setBlockDate] = useState(today);
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("12:00");
  const [blockError, setBlockError] = useState<string | null>(null);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(
    (showSpinner: boolean) => {
      if (showSpinner) setState({ status: "loading" });
      fetchDoctorAvailability(today, to)
        .then((result) => {
          if (!activeRef.current) return;
          if (result.status === "ready") setState({ status: "ready", slots: result.slots });
          else setState({ status: result.status });
        })
        .catch(() => {
          if (activeRef.current) setState({ status: "error" });
        });
    },
    [today, to],
  );

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const byDate = useMemo(() => {
    const slots = state.status === "ready" ? state.slots : [];
    const map = new Map<string, DoctorAvailabilitySlot[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [state]);

  const summary = useMemo(() => {
    const slots = state.status === "ready" ? state.slots : [];
    return {
      available: slots.filter((s) => s.isActive && !s.isBooked).length,
      booked: slots.filter((s) => s.isBooked).length,
      off: slots.filter((s) => !s.isActive).length,
    };
  }, [state]);

  const mutationMessage = (reason: string): string => {
    switch (reason) {
      case "unavailable":
        return "Availability management is not enabled on this database yet.";
      case "past":
        return "That date is in the past. Choose today or a future date.";
      case "booked":
        return "That slot is booked, so it cannot be turned off. The appointment is protected.";
      case "invalid":
        return "Please check the date and time you entered.";
      default:
        return "Something went wrong. Nothing was changed — please try again.";
    }
  };

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setAddError(null);
    if (!addDate || !addTime) {
      setAddError("Enter a date and a start time.");
      return;
    }
    if (addDate < today) {
      setAddError("The date must be today or later.");
      return;
    }
    setBusy(true);
    const result = await addDoctorAvailability(addDate, addTime);
    setBusy(false);
    if (result.ok) {
      showToast("success", `Added availability on ${formatLongDate(addDate)} at ${formatTime(addTime)}.`);
      load(false);
    } else {
      const m = mutationMessage(result.reason);
      if (result.reason === "past" || result.reason === "invalid") setAddError(m);
      else showToast("error", m);
    }
  }

  async function onBlock(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBlockError(null);
    if (!blockDate || !blockStart || !blockEnd) {
      setBlockError("Enter a date and a start and end time.");
      return;
    }
    if (blockEnd <= blockStart) {
      setBlockError("The end time must be after the start time.");
      return;
    }
    if (blockDate < today) {
      setBlockError("The date must be today or later.");
      return;
    }
    setBusy(true);
    const result = await blockDoctorAvailability(blockDate, blockStart, blockEnd);
    setBusy(false);
    if (result.ok) {
      showToast(
        result.blocked > 0 ? "success" : "info",
        result.blocked > 0
          ? `Blocked ${result.blocked} unbooked slot${result.blocked === 1 ? "" : "s"} on ${formatLongDate(blockDate)}.`
          : "No unbooked slots were found in that time range.",
      );
      load(false);
    } else {
      const m = mutationMessage(result.reason);
      if (result.reason === "past" || result.reason === "invalid") setBlockError(m);
      else showToast("error", m);
    }
  }

  async function toggleSlot(slot: DoctorAvailabilitySlot) {
    if (busy || slot.isBooked) return;
    setBusy(true);
    const result = await setDoctorAvailabilityActive(slot.id, !slot.isActive);
    setBusy(false);
    if (result.ok) {
      showToast(
        "success",
        slot.isActive ? "Slot turned off — patients can no longer book it." : "Slot turned on and bookable.",
      );
      load(false);
    } else {
      showToast("error", mutationMessage(result.reason));
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Changes here flow straight into the same booking system patients use — a new slot is bookable
        immediately, and a slot you turn off disappears from patient booking. Booked slots are
        protected and can never be removed here.
      </p>

      {toast ? <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}

      <div className={styles.forms}>
        <form className={styles.formCard} onSubmit={onAdd} aria-labelledby="add-heading">
          <h2 id="add-heading" className={styles.formTitle}>
            Add availability
          </h2>
          <div className={styles.formRow}>
            <FormField label="Date" htmlFor="add-date" error={addError && addError.includes("date") ? addError : undefined}>
              {({ describedBy }) => (
                <Input
                  id="add-date"
                  type="date"
                  min={today}
                  value={addDate}
                  aria-describedby={describedBy}
                  onChange={(e) => setAddDate(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Start time" htmlFor="add-time">
              {() => (
                <Input id="add-time" type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
              )}
            </FormField>
          </div>
          {addError && !addError.includes("date") ? (
            <p className={styles.formError} role="alert">
              {addError}
            </p>
          ) : null}
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Working…" : "Add Slot"}
          </Button>
        </form>

        <form className={styles.formCard} onSubmit={onBlock} aria-labelledby="block-heading">
          <h2 id="block-heading" className={styles.formTitle}>
            Block time (leave / meeting)
          </h2>
          <div className={styles.formRow}>
            <FormField label="Date" htmlFor="block-date" error={blockError && blockError.includes("date") ? blockError : undefined}>
              {({ describedBy }) => (
                <Input
                  id="block-date"
                  type="date"
                  min={today}
                  value={blockDate}
                  aria-describedby={describedBy}
                  onChange={(e) => setBlockDate(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="From" htmlFor="block-start">
              {() => (
                <Input id="block-start" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
              )}
            </FormField>
            <FormField label="To" htmlFor="block-end">
              {() => (
                <Input id="block-end" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
              )}
            </FormField>
          </div>
          {blockError && !blockError.includes("date") ? (
            <p className={styles.formError} role="alert">
              {blockError}
            </p>
          ) : null}
          <Button variant="secondary" type="submit" disabled={busy}>
            {busy ? "Working…" : "Block Time"}
          </Button>
        </form>
      </div>

      <div className={styles.scheduleHead}>
        <h2 className={styles.scheduleTitle}>Your schedule</h2>
        <div className={styles.rangeSwitch} role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`${styles.rangeBtn} ${rangeDays === r.value ? styles.rangeActive : ""}`}
              aria-pressed={rangeDays === r.value}
              onClick={() => setRangeDays(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === "ready" ? (
        <div className={styles.legend} aria-hidden="false">
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swAvailable}`} /> Available ({summary.available})
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swBooked}`} /> Booked ({summary.booked})
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swOff}`} /> Off ({summary.off})
          </span>
        </div>
      ) : null}

      {state.status === "loading" && <LoadingState label="Loading your availability…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "unavailable" && (
        <EmptyState
          icon={<InfoIcon />}
          title="Availability management is not enabled yet"
          body="This feature has not been switched on for the clinic database yet. Once the database update is applied, you can manage your bookable hours here."
        />
      )}
      {state.status === "ready" && byDate.length === 0 && (
        <EmptyState
          icon={<CalendarIcon />}
          title="No availability in this range"
          body="Use “Add availability” above to create bookable slots, and they will appear here."
        />
      )}

      {state.status === "ready" && byDate.length > 0 && (
        <ul className={styles.days}>
          {byDate.map(([date, slots]) => (
            <li key={date} className={styles.dayCard}>
              <h3 className={styles.dayTitle}>{formatLongDate(date)}</h3>
              <ul className={styles.slots}>
                {slots.map((slot) => (
                  <li key={slot.id}>
                    <div
                      className={`${styles.slot} ${
                        slot.isBooked ? styles.slotBooked : slot.isActive ? styles.slotAvailable : styles.slotOff
                      }`}
                    >
                      <span className={styles.slotTime}>{formatTime(slot.time)}</span>
                      <span className={styles.slotState}>
                        {slot.isBooked ? (
                          <>
                            <LockIcon aria-hidden="true" className={styles.slotIcon} /> Booked
                          </>
                        ) : slot.isActive ? (
                          "Available"
                        ) : (
                          "Off"
                        )}
                      </span>
                      {slot.isBooked ? null : (
                        <button
                          type="button"
                          className={styles.slotToggle}
                          disabled={busy}
                          onClick={() => void toggleSlot(slot)}
                        >
                          {slot.isActive ? "Turn off" : "Turn on"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
