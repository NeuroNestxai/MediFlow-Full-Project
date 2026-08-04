"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormField } from "@/components/ui/FormField";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchServices, fetchDoctors } from "@/lib/patient/client-data";
import {
  staffSearchPatients,
  staffFetchAvailableSlots,
  staffCreateAppointment,
  fetchStaffAppointments,
  type StaffSlot,
} from "@/lib/staff/client-data";
import type { DirectoryService, DirectoryDoctor } from "@/lib/patient/types";
import type { PatientSearchResult } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatDate,
  formatTime,
  DEMO_AVAILABILITY_NOTICE,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import styles from "./ReceptionBooking.module.css";

const NOTES_MAX = 2000;

type DirectoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; services: DirectoryService[]; doctors: DirectoryDoctor[] };

type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; slots: StaffSlot[] };

interface Confirmed {
  reference: string;
  date: string;
  time: string;
  status: DbAppointmentStatus;
  patientName: string;
  doctorName: string;
  serviceName: string;
}

export function ReceptionBooking() {
  const searchParams = useSearchParams();
  const prefillDoctor = searchParams.get("doctorId");
  const prefillPatient = searchParams.get("patientId");

  const [directory, setDirectory] = useState<DirectoryState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [slots, setSlots] = useState<SlotsState>({ status: "idle" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    Promise.all([fetchServices(), fetchDoctors()])
      .then(([services, doctors]) => {
        if (!activeRef.current) return;
        setDirectory({ status: "ready", services, doctors });
      })
      .catch(() => {
        if (activeRef.current) setDirectory({ status: "error" });
      });
    return () => {
      activeRef.current = false;
    };
  }, [reloadKey]);

  const services = useMemo(
    () => (directory.status === "ready" ? directory.services : []),
    [directory],
  );
  const doctors = useMemo(
    () => (directory.status === "ready" ? directory.doctors : []),
    [directory],
  );

  // Resolve a prefilled patient (from the Patients screen) by name via the
  // reception-scoped appointments read — no personal data travels in the URL.
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (prefillHandled.current || !prefillPatient) return;
    prefillHandled.current = true;
    fetchStaffAppointments({})
      .then((appts) => {
        if (!activeRef.current) return;
        const match = appts.find((a) => a.patientId === prefillPatient);
        if (match) {
          setPatient({ patientId: match.patientId, name: match.patientName, phone: match.patientPhone });
        }
      })
      .catch(() => {});
  }, [prefillPatient]);

  // Debounced patient search. All state updates happen inside the timer/promise
  // callbacks (asynchronously), never synchronously in the effect body.
  useEffect(() => {
    const term = patientQuery.trim();
    if (patient || term.length < 2) {
      const clear = window.setTimeout(() => {
        if (!activeRef.current) return;
        setPatientResults([]);
        setSearching(false);
      }, 0);
      return () => window.clearTimeout(clear);
    }
    const start = window.setTimeout(() => setSearching(true), 0);
    const handle = window.setTimeout(() => {
      staffSearchPatients(term)
        .then((results) => {
          if (activeRef.current) setPatientResults(results);
        })
        .finally(() => {
          if (activeRef.current) setSearching(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(handle);
    };
  }, [patientQuery, patient]);

  const eligibleDoctors = useMemo(
    () => (serviceId ? doctors.filter((d) => d.services.some((s) => s.id === serviceId)) : []),
    [doctors, serviceId],
  );

  // Prefill the doctor once the directory + service are known.
  useEffect(() => {
    if (!prefillDoctor || directory.status !== "ready" || doctorId) return;
    const doc = doctors.find((d) => d.id === prefillDoctor);
    if (!doc) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!serviceId && doc.services[0]) setServiceId(doc.services[0].id);
    setDoctorId(prefillDoctor);
  }, [prefillDoctor, directory.status, doctors, doctorId, serviceId]);

  // Load slots whenever doctor + service are both chosen.
  useEffect(() => {
    if (!doctorId || !serviceId) {
      const clear = window.setTimeout(() => {
        if (activeRef.current) setSlots({ status: "idle" });
      }, 0);
      return () => window.clearTimeout(clear);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots({ status: "loading" });
    setSelectedDate(null);
    setSelectedSlotId(null);
    staffFetchAvailableSlots(doctorId, serviceId)
      .then((result) => {
        if (!activeRef.current) return;
        if (result.status === "ready") setSlots({ status: "ready", slots: result.slots });
        else setSlots({ status: result.status });
      })
      .catch(() => {
        if (activeRef.current) setSlots({ status: "error" });
      });
  }, [doctorId, serviceId]);

  const slotsByDate = useMemo(() => {
    const list = slots.status === "ready" ? slots.slots : [];
    const map = new Map<string, StaffSlot[]>();
    for (const s of list) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const service = services.find((s) => s.id === serviceId);
  const doctor = doctors.find((d) => d.id === doctorId);
  const selectedSlot =
    slots.status === "ready" ? slots.slots.find((s) => s.availabilityId === selectedSlotId) ?? null : null;
  const hasDemoSlot = slots.status === "ready" && slots.slots.some((s) => s.isDemo);

  const canSubmit = Boolean(patient && serviceId && doctorId && selectedSlot) && !submitting;

  async function submit() {
    if (!patient || !serviceId || !doctorId || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    const result = await staffCreateAppointment({
      patientId: patient.patientId,
      doctorId,
      serviceId,
      availabilityId: selectedSlot.availabilityId,
      notes: notes.trim() || null,
    });
    if (!activeRef.current) return;
    setSubmitting(false);
    if (result.ok) {
      setConfirmed({
        reference: result.reference,
        date: result.date,
        time: result.time,
        status: result.status,
        patientName: patient.name,
        doctorName: doctor ? displayDoctorName(doctor.fullName) : "Doctor",
        serviceName: service?.name ?? "Service",
      });
    } else if (result.reason === "conflict") {
      setError("That slot was just taken. Please choose another time.");
      // Refresh slots so the taken one disappears.
      staffFetchAvailableSlots(doctorId, serviceId).then((r) => {
        if (activeRef.current && r.status === "ready") setSlots({ status: "ready", slots: r.slots });
      });
      setSelectedSlotId(null);
    } else if (result.reason === "unavailable") {
      setError("Reception booking is not enabled on this database yet.");
    } else if (result.reason === "invalid") {
      setError("Some of the booking details are no longer valid. Please review and try again.");
    } else {
      setError("Something went wrong. Nothing was changed — please try again.");
    }
  }

  function reset() {
    setConfirmed(null);
    setPatient(null);
    setPatientQuery("");
    setServiceId("");
    setDoctorId("");
    setSlots({ status: "idle" });
    setSelectedDate(null);
    setSelectedSlotId(null);
    setNotes("");
    setError(null);
  }

  if (directory.status === "loading") return <LoadingState label="Loading services and doctors…" />;
  if (directory.status === "error")
    return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;

  if (confirmed) {
    return (
      <section className={styles.successCard} aria-live="polite">
        <StatusBadge tone={DB_STATUS_TONE[confirmed.status]} label={DB_STATUS_LABEL[confirmed.status]} />
        <h2 className={styles.successTitle}>Appointment booked</h2>
        <p className={styles.successMeta}>
          {confirmed.patientName} · {confirmed.serviceName} · {confirmed.doctorName}
        </p>
        <p className={styles.successMeta}>
          {formatDate(confirmed.date)} at {formatTime(confirmed.time)}
        </p>
        <p className={styles.successRef}>
          Booking reference <strong>{confirmed.reference}</strong>
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={reset}>
            Book Another
          </Button>
          <Button variant="secondary" href="/reception/dashboard">
            Back to Dashboard
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.wrap}>
      {/* 1. Patient */}
      <section className={styles.step} aria-labelledby="step-patient">
        <h2 id="step-patient" className={styles.stepTitle}>
          1. Patient
        </h2>
        {patient ? (
          <div className={styles.selectedRow}>
            <div>
              <p className={styles.selectedName}>{patient.name}</p>
              <p className={styles.selectedMeta}>{patient.phone ?? "No phone on file"}</p>
            </div>
            <Button
              variant="tertiary"
              onClick={() => {
                setPatient(null);
                setPatientQuery("");
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <FormField label="Find a patient" htmlFor="patient-search" hint="Search by name or phone (at least 2 characters).">
              {({ describedBy }) => (
                <Input
                  id="patient-search"
                  type="search"
                  value={patientQuery}
                  placeholder="Patient name or phone…"
                  aria-describedby={describedBy}
                  autoComplete="off"
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
              )}
            </FormField>
            {searching ? <p className={styles.hint}>Searching…</p> : null}
            {!searching && patientQuery.trim().length >= 2 && patientResults.length === 0 ? (
              <p className={styles.hint}>No patients match that search.</p>
            ) : null}
            {patientResults.length > 0 ? (
              <ul className={styles.results}>
                {patientResults.map((p) => (
                  <li key={p.patientId}>
                    <button type="button" className={styles.resultBtn} onClick={() => setPatient(p)}>
                      <span className={styles.selectedName}>{p.name}</span>
                      <span className={styles.selectedMeta}>{p.phone ?? "No phone on file"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      {/* 2. Service */}
      {patient ? (
        <section className={styles.step} aria-labelledby="step-service">
          <h2 id="step-service" className={styles.stepTitle}>
            2. Service
          </h2>
          <FormField label="Service" htmlFor="service-select">
            {() => (
              <Select
                id="service-select"
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setDoctorId("");
                }}
              >
                <option value="">Choose a service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </section>
      ) : null}

      {/* 3. Doctor */}
      {patient && serviceId ? (
        <section className={styles.step} aria-labelledby="step-doctor">
          <h2 id="step-doctor" className={styles.stepTitle}>
            3. Doctor
          </h2>
          {eligibleDoctors.length === 0 ? (
            <EmptyState title="No doctor offers this service" body="Choose a different service to continue." />
          ) : (
            <div className={styles.doctorGrid}>
              {eligibleDoctors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`${styles.doctorCard} ${doctorId === d.id ? styles.doctorActive : ""}`}
                  aria-pressed={doctorId === d.id}
                  onClick={() => setDoctorId(d.id)}
                >
                  <DoctorPortrait palette={(d.portraitPalette ?? 1) as 1 | 2 | 3 | 4} size={40} />
                  <span className={styles.doctorName}>{displayDoctorName(d.fullName)}</span>
                  <span className={styles.selectedMeta}>
                    {d.specialties.map((s) => s.name).join(" · ") || "General"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 4. Date + time */}
      {patient && serviceId && doctorId ? (
        <section className={styles.step} aria-labelledby="step-slot">
          <h2 id="step-slot" className={styles.stepTitle}>
            4. Date &amp; time
          </h2>
          {slots.status === "loading" && <LoadingState label="Loading available slots…" />}
          {slots.status === "error" && (
            <ErrorState
              onRetry={() => {
                setSlots({ status: "loading" });
                staffFetchAvailableSlots(doctorId, serviceId).then((r) => {
                  if (!activeRef.current) return;
                  if (r.status === "ready") setSlots({ status: "ready", slots: r.slots });
                  else setSlots({ status: r.status });
                });
              }}
            />
          )}
          {slots.status === "unavailable" && (
            <EmptyState
              title="Booking is not enabled yet"
              body="Reception-assisted booking has not been switched on for this database yet."
            />
          )}
          {slots.status === "ready" && slotsByDate.length === 0 && (
            <EmptyState title="No open slots" body="This doctor has no available slots for this service right now." />
          )}
          {slots.status === "ready" && slotsByDate.length > 0 && (
            <>
              {hasDemoSlot ? (
                <p className={styles.demoNote}>
                  <SourceLabel source="prototype-data" /> {DEMO_AVAILABILITY_NOTICE}
                </p>
              ) : null}
              <div className={styles.dateChips} role="group" aria-label="Choose a date">
                {slotsByDate.map(([date]) => (
                  <button
                    key={date}
                    type="button"
                    className={`${styles.chip} ${selectedDate === date ? styles.chipActive : ""}`}
                    aria-pressed={selectedDate === date}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlotId(null);
                    }}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>
              {selectedDate ? (
                <div className={styles.timeChips} role="group" aria-label="Choose a time">
                  {(slotsByDate.find(([d]) => d === selectedDate)?.[1] ?? []).map((s) => (
                    <button
                      key={s.availabilityId}
                      type="button"
                      className={`${styles.chip} ${selectedSlotId === s.availabilityId ? styles.chipActive : ""}`}
                      aria-pressed={selectedSlotId === s.availabilityId}
                      onClick={() => setSelectedSlotId(s.availabilityId)}
                    >
                      {formatTime(s.time)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.hint}>Choose a date to see times.</p>
              )}
            </>
          )}
        </section>
      ) : null}

      {/* 5. Notes + review */}
      {patient && serviceId && doctorId && selectedSlot ? (
        <section className={styles.step} aria-labelledby="step-review">
          <h2 id="step-review" className={styles.stepTitle}>
            5. Confirm
          </h2>
          <FormField label="Notes from the patient (optional)" htmlFor="booking-notes" hint={`${notes.length}/${NOTES_MAX}`}>
            {({ describedBy }) => (
              <Textarea
                id="booking-notes"
                rows={3}
                maxLength={NOTES_MAX}
                value={notes}
                aria-describedby={describedBy}
                placeholder="Reason for visit, as reported by the patient."
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </FormField>

          <dl className={styles.review}>
            <div className={styles.reviewRow}>
              <dt>Patient</dt>
              <dd>{patient.name}</dd>
            </div>
            <div className={styles.reviewRow}>
              <dt>Service</dt>
              <dd>{service?.name}</dd>
            </div>
            <div className={styles.reviewRow}>
              <dt>Doctor</dt>
              <dd>{doctor ? displayDoctorName(doctor.fullName) : "—"}</dd>
            </div>
            <div className={styles.reviewRow}>
              <dt>When</dt>
              <dd>
                {formatDate(selectedSlot.date)} at {formatTime(selectedSlot.time)}
              </dd>
            </div>
          </dl>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? "Booking…" : "Book Appointment"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
