"use client";

import { Button } from "@/components/ui/Button";
import { TimeSlotChip } from "@/components/ai/Chips";
import { formatDate, formatTime, DEMO_AVAILABILITY_NOTICE } from "@/lib/patient/types";
import type { AvailableSlot, DirectoryDoctor, DirectoryService } from "@/lib/patient/types";
import styles from "./page.module.css";

/**
 * In-chat booking confirmation.
 *
 * The assistant may *propose* a doctor, a service and a time. None of that is
 * trusted: every slot shown here was read back from `get_available_slots_v2`,
 * so a time the assistant invented, or one that was taken while the patient
 * was typing, simply never appears. The patient picks from real availability
 * and confirms, and the write runs from their own session through
 * `create_patient_appointment` — the same path the booking screen uses.
 */

export type BookingState =
  | { status: "resolving"; service: DirectoryService; doctor: DirectoryDoctor }
  | {
      status: "ready";
      service: DirectoryService;
      doctor: DirectoryDoctor;
      slots: AvailableSlot[];
      /** The assistant's proposed time, only if it is genuinely available. */
      proposed: AvailableSlot | null;
    }
  | { status: "unavailable"; service: DirectoryService; doctor: DirectoryDoctor }
  | { status: "booking"; service: DirectoryService; doctor: DirectoryDoctor }
  | {
      status: "booked";
      service: DirectoryService;
      doctor: DirectoryDoctor;
      reference: string;
      date: string;
      time: string;
    }
  | { status: "failed"; service: DirectoryService; doctor: DirectoryDoctor; conflict: boolean };

interface Props {
  state: BookingState;
  selectedId: string | null;
  onSelect: (availabilityId: string) => void;
  onConfirm: () => void;
  onRetry: () => void;
}

export function ChatBookingCard({ state, selectedId, onSelect, onConfirm, onRetry }: Props) {
  const who = `${state.doctor.fullName} · ${state.service.name}`;

  if (state.status === "resolving") {
    return (
      <div className={styles.handoff}>
        <p className={styles.handoffNote} role="status">
          Checking real availability for {who}…
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className={styles.handoff}>
        <p className={styles.handoffNote}>
          {state.doctor.fullName} has no open times for {state.service.name} at the moment.
          You can see other doctors offering this service in the booking screen.
        </p>
        <div className={styles.handoffActions}>
          <Button variant="primary" href={`/patient/booking?serviceId=${state.service.id}`}>
            See other options
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "booked") {
    return (
      <div className={`${styles.handoff} ${styles.handoffDone}`}>
        <p className={styles.handoffTitle}>Appointment confirmed</p>
        <p className={styles.handoffNote}>
          {who}
          <br />
          {formatDate(state.date)} · {formatTime(state.time)}
          <br />
          Booking reference <strong>{state.reference}</strong>
        </p>
        <div className={styles.handoffActions}>
          <Button variant="primary" href={`/patient/qr?ref=${encodeURIComponent(state.reference)}`}>
            Show Check-In QR
          </Button>
          <Button variant="secondary" href="/patient/appointments">
            My Appointments
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className={styles.handoff}>
        <p className={styles.handoffNote} role="alert">
          {state.conflict
            ? "That time was just taken by someone else. Nothing was booked — please pick another time."
            : "The appointment couldn't be booked. Nothing was changed — please try again."}
        </p>
        <div className={styles.handoffActions}>
          <Button variant="primary" onClick={onRetry}>
            Show times again
          </Button>
        </div>
      </div>
    );
  }

  const booking = state.status === "booking";
  const slots = state.status === "ready" ? state.slots : [];
  const proposed = state.status === "ready" ? state.proposed : null;

  return (
    <div className={styles.handoff}>
      <p className={styles.handoffTitle}>Book this appointment</p>
      <p className={styles.handoffNote}>
        {who}
        {proposed ? (
          <>
            <br />
            MediFlow suggested {formatDate(proposed.date)} at {formatTime(proposed.time)} — it is
            available.
          </>
        ) : null}
      </p>

      <fieldset className={styles.slotFieldset} disabled={booking}>
        <legend className={styles.handoffNote}>Choose a time</legend>
        <div className={styles.handoffActions}>
          {slots.map((s) => (
            <TimeSlotChip
              key={s.availabilityId}
              label={`${formatDate(s.date)} · ${formatTime(s.time)}`}
              selected={selectedId === s.availabilityId}
              onClick={() => onSelect(s.availabilityId)}
            />
          ))}
        </div>
      </fieldset>

      <p className={styles.handoffFine}>{DEMO_AVAILABILITY_NOTICE}</p>

      <div className={styles.handoffActions}>
        <Button variant="primary" onClick={onConfirm} disabled={!selectedId || booking}>
          {booking ? "Booking…" : "Confirm Booking"}
        </Button>
        <Button variant="secondary" href={`/patient/booking?serviceId=${state.service.id}`}>
          More options
        </Button>
      </div>
    </div>
  );
}
