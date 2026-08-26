"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { TimeSlotChip } from "@/components/ai/Chips";
import { FloOrb } from "@/components/ai/FloOrb";
import { ServiceDirectoryCard } from "@/components/patient/ServiceDirectoryCard";
import { DoctorDirectoryCard } from "@/components/patient/DoctorDirectoryCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { PatientPage } from "@/components/patient/PatientPage";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import {
  fetchServices,
  fetchDoctors,
  fetchAvailableSlots,
  createAppointment,
} from "@/lib/patient/client-data";
import {
  formatDate,
  formatTime,
  DB_STATUS_LABEL,
  DEMO_AVAILABILITY_NOTICE,
  type DirectoryService,
  type DirectoryDoctor,
  type AvailableSlot,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

const STEP_LABELS = ["Service", "Doctor", "Date", "Time", "Patient Info", "Review"] as const;
const NOTES_MAX = 2000;
const DATE_PAGE = 6;

type DirectoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; services: DirectoryService[]; doctors: DirectoryDoctor[] };

type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; list: AvailableSlot[] };

interface Confirmed {
  reference: string;
  date: string;
  time: string;
  status: DbAppointmentStatus;
  doctorName: string;
  serviceName: string;
}

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function BookingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reducedMotion } = useAccessibility();
  const notesId = useId();

  const [directory, setDirectory] = useState<DirectoryState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | undefined>();
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [slots, setSlots] = useState<SlotsState>({ status: "idle" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [visibleDates, setVisibleDates] = useState(DATE_PAGE);
  const [notes, setNotes] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  // Load the directory once (and prefill the service from the query string).
  useEffect(() => {
    let active = true;
    Promise.all([fetchServices(), fetchDoctors()])
      .then(([services, doctors]) => {
        if (!active) return;
        setDirectory({ status: "ready", services, doctors });
        const qService = searchParams.get("serviceId");
        if (qService && services.some((s) => s.id === qService)) {
          setServiceId(qService);
          setStep(1);
        }
      })
      .catch(() => {
        if (active) setDirectory({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey, searchParams]);

  function retryDirectory() {
    setDirectory({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  const services = directory.status === "ready" ? directory.services : [];
  const doctors = directory.status === "ready" ? directory.doctors : [];
  const service = services.find((s) => s.id === serviceId);
  const doctor = doctors.find((d) => d.id === doctorId);

  const availableDoctors = useMemo(() => {
    if (directory.status !== "ready" || !serviceId) return [];
    return directory.doctors.filter((d) => d.services.some((s) => s.id === serviceId));
  }, [directory, serviceId]);

  const slotList = slots.status === "ready" ? slots.list : [];
  const slotDates = useMemo(() => {
    const list = slots.status === "ready" ? slots.list : [];
    return Array.from(new Set(list.map((s) => s.date))).sort();
  }, [slots]);
  const timesForDate = useMemo(() => {
    const list = slots.status === "ready" ? slots.list : [];
    return list.filter((s) => s.date === selectedDate);
  }, [slots, selectedDate]);
  const selectedSlot = slotList.find((s) => s.availabilityId === selectedSlotId) ?? null;
  const demoSlot = slotList.find((s) => s.isDemo);
  const demoNotice = demoSlot ? demoSlot.sourceLabel ?? DEMO_AVAILABILITY_NOTICE : null;
  const shownDates = slotDates.slice(0, visibleDates);

  async function loadSlots(dId: string, sId: string): Promise<AvailableSlot[]> {
    setSlots({ status: "loading" });
    try {
      const list = await fetchAvailableSlots(dId, sId);
      setSlots({ status: "ready", list });
      setVisibleDates(DATE_PAGE);
      return list;
    } catch {
      setSlots({ status: "error" });
      return [];
    }
  }

  function selectService(id: string) {
    setServiceId(id);
    setDoctorId(undefined);
    setSlots({ status: "idle" });
    setSelectedDate(null);
    setSelectedSlotId(null);
    setStepError(null);
    setBookingError(null);
    setStep(1);
  }

  async function selectDoctor(id: string) {
    if (!serviceId) return;
    setDoctorId(id);
    setSelectedDate(null);
    setSelectedSlotId(null);
    setStepError(null);
    setBookingError(null);
    setStep(2);
    await loadSlots(id, serviceId);
  }

  function next() {
    setStepError(null);
    if (step === 2 && !selectedDate) {
      setStepError("Select a date to continue.");
      return;
    }
    if (step === 3 && !selectedSlotId) {
      setStepError("Select a time to continue.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function back() {
    setStepError(null);
    if (step === 0) {
      router.push("/patient/dashboard");
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  // Refresh slots before showing Review; bounce back if the slot vanished.
  async function goToReview() {
    if (!doctorId || !serviceId || !selectedSlotId) return;
    setBookingError(null);
    const fresh = await loadSlots(doctorId, serviceId);
    if (!fresh.some((s) => s.availabilityId === selectedSlotId)) {
      setSelectedSlotId(null);
      setStepError("That time is no longer available. Please choose another time.");
      setStep(3);
      return;
    }
    setStep(5);
  }

  async function confirmBooking() {
    if (!doctorId || !serviceId || !selectedSlotId || !service || !doctor) return;
    setSubmitting(true);
    setBookingError(null);
    const result = await createAppointment({
      doctorId,
      serviceId,
      availabilityId: selectedSlotId,
      notes: notes.trim() ? notes.trim() : null,
    });
    setSubmitting(false);

    if (result.ok) {
      setConfirmed({
        reference: result.reference,
        date: result.date,
        time: result.time,
        status: result.status,
        doctorName: doctor.fullName,
        serviceName: service.name,
      });
      return;
    }

    if (result.conflict) {
      setBookingError("That time was just booked. Please select another available time.");
      setSelectedSlotId(null);
      await loadSlots(doctorId, serviceId);
      setStep(3);
    } else {
      setBookingError("We couldn't complete your booking. Please try again.");
    }
  }

  // ---- Confirmation screen ----
  if (confirmed) {
    // Every new booking starts as `pending_approval` -- it is not actually
    // confirmed until reception approves it. The QR code is for check-in,
    // which only makes sense once the visit is real, so it's hidden while
    // the request is still pending too.
    const isPending = confirmed.status === "pending_approval";
    return (
      <div className={styles.confirmPage}>
        <FloOrb state="success" size={80} reducedMotion={reducedMotion} />
        <h1 className={styles.confirmTitle}>
          {isPending ? "Booking request sent!" : "Appointment confirmed!"}
        </h1>
        <p className={styles.confirmSubtitle}>
          {isPending
            ? "Reception will review your request \u2014 you'll be notified once it's approved."
            : "Keep your booking reference for check-in."}
        </p>
        <div className={styles.confirmCard}>
          <p className={styles.confirmDoctor}>{confirmed.doctorName}</p>
          <p className={styles.confirmMeta}>{confirmed.serviceName}</p>
          <p className={styles.confirmMeta}>
            {formatDate(confirmed.date)} · {formatTime(confirmed.time)} ·{" "}
            {DB_STATUS_LABEL[confirmed.status]}
          </p>
          <p className={styles.confirmRef}>Booking reference: {confirmed.reference}</p>
        </div>
        <div className={styles.confirmActions}>
          {!isPending ? (
            <Button variant="secondary" href={`/patient/qr?ref=${encodeURIComponent(confirmed.reference)}`}>
              Show Check-In QR Code
            </Button>
          ) : null}
          <Button variant="primary" href="/patient/dashboard">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ---- Directory loading / error ----
  if (directory.status === "loading") {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading booking…" />
      </div>
    );
  }
  if (directory.status === "error") {
    return (
      <div className={styles.page}>
        <ErrorState onRetry={retryDirectory} />
      </div>
    );
  }

  return (
    <PatientPage width="default">
      <div className={styles.bookingTop}>
        <TourLauncher tour={PATIENT_TOURS.booking} />
      </div>

      <div className={styles.stepper} role="list" aria-label="Booking steps" data-tour="booking-steps">
        {STEP_LABELS.map((label, i) => (
          <div key={label} role="listitem" className={styles.stepItem}>
            <span
              className={`${styles.stepDot} ${i === step ? styles.stepActive : i < step ? styles.stepDone : ""}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className={i === step ? styles.stepLabelActive : styles.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div className={styles.selSummary} data-tour="booking-summary" aria-label="Your selections">
        <span className={styles.selTag}>Service: {service?.name ?? "—"}</span>
        <span className={styles.selTag}>Doctor: {doctor?.fullName ?? "—"}</span>
        <span className={styles.selTag}>Date: {selectedDate ? formatDate(selectedDate) : "—"}</span>
        <span className={styles.selTag}>Time: {selectedSlot ? formatTime(selectedSlot.time) : "—"}</span>
      </div>

      <p className={controls.notice} data-tour="booking-availability-note">
        {DEMO_AVAILABILITY_NOTICE}
      </p>

      {step === 0 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            Select a service
          </h1>
          {services.length === 0 ? (
            <EmptyState title="No services available" body="Please check back later." />
          ) : (
            <div className={styles.cardGrid}>
              {services.map((s) => (
                <ServiceDirectoryCard key={s.id} service={s} onViewDoctors={() => selectService(s.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            Select a doctor
          </h1>
          {service ? <p className={styles.stepHint}>For {service.name}</p> : null}
          {availableDoctors.length === 0 ? (
            <EmptyState
              title="No doctors available for this service"
              body="Please choose a different service."
            />
          ) : (
            <div className={styles.cardGrid}>
              {availableDoctors.map((d) => (
                <DoctorDirectoryCard
                  key={d.id}
                  doctor={d}
                  onViewProfile={() => selectDoctor(d.id)}
                  onBook={() => selectDoctor(d.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            Select a date
          </h1>
          {slots.status === "loading" && <LoadingState label="Loading available dates…" />}
          {slots.status === "error" && (
            <ErrorState
              onRetry={() => {
                if (doctorId && serviceId) void loadSlots(doctorId, serviceId);
              }}
            />
          )}
          {slots.status === "ready" && slotDates.length === 0 && (
            <EmptyState
              title="No available times"
              body="This doctor has no open slots right now. Please try another doctor or check back later."
            />
          )}
          {slots.status === "ready" && slotDates.length > 0 && (
            <>
              {demoNotice ? <p className={controls.notice}>{demoNotice}</p> : null}
              <div className={styles.dateRow} role="group" aria-label="Available dates">
                {shownDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className={`${styles.dateChip} ${selectedDate === date ? styles.dateChipActive : ""}`}
                    aria-pressed={selectedDate === date}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlotId(null);
                      setStepError(null);
                    }}
                  >
                    <span className={styles.dateDay}>{weekdayLabel(date)}</span>
                    <span className={styles.dateNum}>{Number(date.split("-")[2])}</span>
                  </button>
                ))}
              </div>
              {visibleDates < slotDates.length && (
                <div className={controls.loadMoreRow}>
                  <Button variant="secondary" onClick={() => setVisibleDates((v) => v + DATE_PAGE)}>
                    Show More Dates
                  </Button>
                </div>
              )}
              {stepError ? (
                <p role="alert" className={styles.errorText}>
                  {stepError}
                </p>
              ) : null}
              <div className={styles.stepActionsRight}>
                <Button variant="primary" onClick={next}>
                  Continue
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            Select a time
          </h1>
          {selectedDate ? <p className={styles.stepHint}>{formatDate(selectedDate)}</p> : null}
          {demoNotice ? <p className={controls.notice}>{demoNotice}</p> : null}
          {timesForDate.length === 0 ? (
            <EmptyState title="No times on this date" body="Please pick another date." />
          ) : (
            <div className={styles.timeGrid} role="group" aria-label="Available times">
              {timesForDate.map((slot) => (
                <TimeSlotChip
                  key={slot.availabilityId}
                  label={formatTime(slot.time)}
                  selected={selectedSlotId === slot.availabilityId}
                  onClick={() => {
                    setSelectedSlotId(slot.availabilityId);
                    setStepError(null);
                  }}
                />
              ))}
            </div>
          )}
          {stepError ? (
            <p role="alert" className={styles.errorText}>
              {stepError}
            </p>
          ) : null}
          <div className={styles.stepActionsRight}>
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            A few more details
          </h1>
          <div className={styles.form}>
            <FormField label="Reason for visit (optional)" htmlFor={notesId}>
              {({ describedBy }) => (
                <Textarea
                  id={notesId}
                  placeholder="Add a short note for your doctor"
                  value={notes}
                  maxLength={NOTES_MAX}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
            <p className={styles.stepHint}>
              {notes.length}/{NOTES_MAX} characters
            </p>
          </div>
          <div className={styles.stepActionsRight}>
            <Button variant="primary" onClick={goToReview}>
              Continue to Review
            </Button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section aria-labelledby="step-heading">
          <h1 id="step-heading" className={styles.stepHeading}>
            Review your appointment
          </h1>
          <div className={styles.reviewCard}>
            <p className={styles.reviewDoctor}>{doctor?.fullName ?? "Select a doctor"}</p>
            <p className={styles.reviewService}>{service?.name ?? "Select a service"}</p>
            <ReviewRow label="Date" value={selectedDate ? formatDate(selectedDate) : "—"} />
            <ReviewRow label="Time" value={selectedSlot ? formatTime(selectedSlot.time) : "—"} />
            <ReviewRow label="Location" value="MCC Clinic, Main Building" />
            {notes.trim() ? <ReviewRow label="Reason for visit" value={notes.trim()} /> : null}
          </div>
          {bookingError ? (
            <p role="alert" className={styles.errorText}>
              {bookingError}
            </p>
          ) : null}
          <div className={styles.stepActionsRight}>
            <Button variant="secondary" onClick={() => setStep(3)} disabled={submitting}>
              Change Time
            </Button>
            <Button variant="primary" onClick={confirmBooking} disabled={submitting}>
              {submitting ? "Booking…" : "Confirm Booking"}
            </Button>
          </div>
        </section>
      )}

      <div className={styles.backRow}>
        <button type="button" className={styles.backLink} onClick={back} disabled={submitting}>
          ← Back
        </button>
      </div>
    </PatientPage>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}
