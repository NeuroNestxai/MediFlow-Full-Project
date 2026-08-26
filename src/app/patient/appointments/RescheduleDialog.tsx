"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TimeSlotChip } from "@/components/ai/Chips";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchAvailableSlots, rescheduleAppointment } from "@/lib/patient/client-data";
import {
  formatDate,
  formatTime,
  DEMO_AVAILABILITY_NOTICE,
  type PatientAppointment,
  type AvailableSlot,
} from "@/lib/patient/types";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

const DATE_PAGE = 6;

type SlotsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; list: AvailableSlot[] };

export function RescheduleDialog({
  appointment,
  onClose,
  onSuccess,
}: {
  appointment: PatientAppointment;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [slots, setSlots] = useState<SlotsState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [visibleDates, setVisibleDates] = useState(DATE_PAGE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // get_available_slots_v2 already excludes slots taken by non-cancelled
    // appointments — including this appointment's own current slot.
    fetchAvailableSlots(appointment.doctorId, appointment.serviceId)
      .then((list) => {
        if (active) setSlots({ status: "ready", list });
      })
      .catch(() => {
        if (active) setSlots({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [appointment.doctorId, appointment.serviceId, reloadKey]);

  const list = slots.status === "ready" ? slots.list : [];
  const dates = useMemo(() => {
    const l = slots.status === "ready" ? slots.list : [];
    return Array.from(new Set(l.map((s) => s.date))).sort();
  }, [slots]);
  const times = useMemo(() => {
    const l = slots.status === "ready" ? slots.list : [];
    return l.filter((s) => s.date === selectedDate);
  }, [slots, selectedDate]);
  const demoSlot = list.find((s) => s.isDemo);
  const demoNotice = demoSlot ? demoSlot.sourceLabel ?? DEMO_AVAILABILITY_NOTICE : null;
  const shownDates = dates.slice(0, visibleDates);
  const selected = list.find((s) => s.availabilityId === selectedSlotId) ?? null;

  async function confirm() {
    if (!selectedSlotId) return;
    setSubmitting(true);
    setError(null);
    const res = await rescheduleAppointment({
      appointmentId: appointment.id,
      availabilityId: selectedSlotId,
    });
    setSubmitting(false);
    if (res.ok) {
      onSuccess("Your appointment has been rescheduled — your booking reference is unchanged.");
      return;
    }
    if (res.conflict) {
      setError("That time was just booked. Please select another available time.");
      setSelectedSlotId(null);
      setReloadKey((k) => k + 1);
    } else {
      setError("We couldn't reschedule this appointment. Please try again.");
    }
  }

  return (
    <Dialog
      open
      onClose={() => (submitting ? undefined : onClose())}
      title="Reschedule appointment"
      description={`Booking reference ${appointment.reference}`}
    >
      <div className={styles.dialogBody}>
        <p>
          <strong>Current:</strong> {formatDate(appointment.date)} · {formatTime(appointment.time)}
        </p>
        {demoNotice ? <p className={controls.notice}>{demoNotice}</p> : null}

        {slots.status === "loading" && <LoadingState label="Loading available times…" />}
        {slots.status === "error" && (
          <ErrorState
            onRetry={() => {
              setSlots({ status: "loading" });
              setReloadKey((k) => k + 1);
            }}
          />
        )}
        {slots.status === "ready" && dates.length === 0 && (
          <EmptyState
            title="No other times available"
            body="This doctor has no other open slots right now. Please try again later."
          />
        )}
        {slots.status === "ready" && dates.length > 0 && (
          <>
            <div className={controls.row} role="group" aria-label="Available dates">
              {shownDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${controls.chip} ${selectedDate === d ? controls.chipActive : ""}`}
                  aria-pressed={selectedDate === d}
                  onClick={() => {
                    setSelectedDate(d);
                    setSelectedSlotId(null);
                  }}
                >
                  {formatDate(d)}
                </button>
              ))}
            </div>
            {visibleDates < dates.length && (
              <div className={controls.loadMoreRow}>
                <Button variant="secondary" onClick={() => setVisibleDates((v) => v + DATE_PAGE)}>
                  Show More Dates
                </Button>
              </div>
            )}
            {selectedDate && (
              <div className={controls.row} role="group" aria-label="Available times">
                {times.map((s) => (
                  <TimeSlotChip
                    key={s.availabilityId}
                    label={formatTime(s.time)}
                    selected={selectedSlotId === s.availabilityId}
                    onClick={() => setSelectedSlotId(s.availabilityId)}
                  />
                ))}
              </div>
            )}
            {selected && (
              <p>
                <strong>New:</strong> {formatDate(selected.date)} · {formatTime(selected.time)}
              </p>
            )}
          </>
        )}

        {error ? (
          <p role="alert" style={{ color: "var(--color-danger, #dc2626)", fontSize: 13 }}>
            {error}
          </p>
        ) : null}

        <div className={styles.dialogActions}>
          <Button variant="primary" onClick={confirm} disabled={submitting || !selectedSlotId}>
            {submitting ? "Rescheduling…" : "Confirm Reschedule"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Keep Current Time
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
