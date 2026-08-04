"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Checkbox } from "@/components/ui/Checkbox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import {
  lookupAppointment,
  checkInAppointment,
  fetchStaffAppointments,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import type { AppointmentLookup, StaffAppointment } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatDate,
  formatTime,
  toPalette,
  type DbAppointmentStatus,
} from "@/lib/patient/types";
import { localToday, formatLocalClock } from "@/lib/staff/dates";
import styles from "./CheckInWorkspace.module.css";

// --- BarcodeDetector feature detection (same approach as the QR scan screen) --
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}
function cameraApiAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    getBarcodeDetectorCtor() !== null
  );
}
const NEVER_CHANGES = () => () => {};

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; appointment: AppointmentLookup };

type CameraState = "off" | "starting" | "running" | "denied" | "failed" | "unsupported";

const CHECK_IN_ELIGIBLE: DbAppointmentStatus[] = ["scheduled", "confirmed"];
const REFERENCE_HINT = "Example: REF-2026-000001. Case is ignored.";

/** Human explanation for why a found appointment cannot be checked in. */
function ineligibleReason(status: DbAppointmentStatus): string {
  switch (status) {
    case "checked_in":
    case "waiting":
    case "in_consultation":
      return "This patient is already checked in.";
    case "completed":
      return "This visit is already complete and ready for checkout.";
    case "checked_out":
      return "This visit is already finished — the patient has checked out.";
    case "cancelled":
      return "This appointment was cancelled and cannot be checked in.";
    case "no_show":
      return "This appointment was recorded as not attended.";
    default:
      return "This appointment cannot be checked in from its current status.";
  }
}

type Mode = "manual" | "scan" | "search";

export function CheckInWorkspace() {
  const [mode, setMode] = useState<Mode>("manual");
  const [reference, setReference] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [success, setSuccess] = useState<{ reference: string; patientName: string; at: string } | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [camera, setCamera] = useState<CameraState>("off");

  // Today's arrivals list (for the search mode + situational awareness).
  const [today, setToday] = useState<StaffAppointment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const todayIso = useMemo(() => localToday(), []);

  const cameraSupported = useSyncExternalStore(NEVER_CHANGES, cameraApiAvailable, () => false);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadToday = useCallback(() => {
    fetchStaffAppointments({ date: todayIso })
      .then((appts) => {
        if (activeRef.current) setToday(appts);
      })
      .catch(() => {
        /* the arrivals list is a convenience; lookup still works */
      });
  }, [todayIso]);

  useEffect(() => {
    activeRef.current = true;
    loadToday();
    const unsub = subscribeToAppointments(loadToday);
    return () => {
      activeRef.current = false;
      unsub();
    };
  }, [loadToday]);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const runLookup = useCallback(
    async (raw: string, fromCamera: boolean) => {
      const value = raw.trim().toUpperCase();
      if (!value) {
        setFieldError("Enter the booking reference from the patient's confirmation.");
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setFieldError(undefined);
      setSuccess(null);
      setIdentityConfirmed(false);
      setLookup({ status: "loading" });

      const result = await lookupAppointment(value);
      busyRef.current = false;
      if (!activeRef.current) return;

      if (result.ok) {
        setLookup({ status: "ready", appointment: result.appointment });
        if (fromCamera) showToast("info", `Scanned ${result.appointment.reference}.`);
        return;
      }
      const message =
        result.reason === "not_found"
          ? "No appointment matches that booking reference. Check the patient's confirmation and try again."
          : result.reason === "invalid"
            ? "That does not look like a booking reference. It should look like REF-2026-000001."
            : "We could not look that up right now. Nothing was changed — please try again.";
      setLookup({ status: "error", message });
      showToast("error", message);
    },
    [showToast],
  );

  const startCamera = useCallback(async () => {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? "";
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamera("failed");
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay refusal is harmless */
    }
    setCamera("running");

    let detector: BarcodeDetectorLike;
    try {
      detector = new Ctor({ formats: ["qr_code"] });
    } catch {
      stopCamera();
      setCamera("unsupported");
      return;
    }

    let scanning = false;
    timerRef.current = window.setInterval(() => {
      if (scanning || !videoRef.current || videoRef.current.readyState < 2) return;
      scanning = true;
      detector
        .detect(videoRef.current)
        .then((codes) => {
          const value = codes[0]?.rawValue?.trim();
          if (!value) return;
          stopCamera();
          setCamera("off");
          setReference(value.toUpperCase());
          void runLookup(value, true);
        })
        .catch(() => {})
        .finally(() => {
          scanning = false;
        });
    }, 350);
  }, [runLookup, stopCamera]);

  async function confirmCheckIn() {
    if (lookup.status !== "ready" || !identityConfirmed) return;
    const appointment = lookup.appointment;
    setCheckingIn(true);
    const result = await checkInAppointment(appointment.appointmentId);
    if (!activeRef.current) return;
    setCheckingIn(false);
    if (result.ok) {
      const at = formatLocalClock();
      setSuccess({ reference: result.reference, patientName: appointment.patientName, at });
      setLookup({ status: "idle" });
      setIdentityConfirmed(false);
      setReference("");
      showToast("success", `${result.reference} checked in.`);
      loadToday();
      return;
    }
    const message =
      result.reason === "not_allowed"
        ? "This patient cannot be checked in right now — they may already be checked in, or the visit was cancelled."
        : result.reason === "not_found"
          ? "That appointment is no longer available. Look the reference up again."
          : "Something went wrong. Nothing was changed — please try again.";
    showToast("error", message);
  }

  function resetLookup() {
    setLookup({ status: "idle" });
    setIdentityConfirmed(false);
    setReference("");
    setFieldError(undefined);
  }

  const appointment = lookup.status === "ready" ? lookup.appointment : null;

  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const eligible = today.filter((a) => CHECK_IN_ELIGIBLE.includes(a.status));
    if (!term) return eligible;
    return eligible.filter(
      (a) =>
        a.patientName.toLowerCase().includes(term) ||
        a.reference.toLowerCase().includes(term) ||
        (a.serviceName ?? "").toLowerCase().includes(term),
    );
  }, [today, searchQuery]);

  const awaitingCount = today.filter((a) => CHECK_IN_ELIGIBLE.includes(a.status)).length;

  return (
    <div className={styles.wrap}>
      <div className={styles.headActions}>
        <p className={styles.awaiting} aria-live="polite">
          {awaitingCount} patient{awaitingCount === 1 ? "" : "s"} still to arrive today
        </p>
        <Button variant="secondary" href="/reception/queue">
          Open Live Queue
        </Button>
      </div>

      {toast ? <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}

      {success ? (
        <section className={styles.successPanel} aria-live="polite">
          <StatusBadge tone="success" label="Checked In" />
          <h2 className={styles.successTitle}>{success.patientName} is checked in</h2>
          <p className={styles.successMeta}>
            Booking reference <strong>{success.reference}</strong> · {success.at}
          </p>
          <div className={styles.actions}>
            <Button variant="primary" href="/reception/queue">
              Go to Live Queue
            </Button>
            <Button variant="secondary" onClick={() => setSuccess(null)}>
              Check In Someone Else
            </Button>
          </div>
        </section>
      ) : null}

      <div className={styles.modeSwitch} role="tablist" aria-label="Check-in method">
        {([
          ["manual", "Enter reference"],
          ["scan", "Scan QR"],
          ["search", "Search arrivals"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`${styles.modeBtn} ${mode === m ? styles.modeActive : ""}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Manual reference entry */}
      {mode === "manual" ? (
        <section className={styles.card} aria-labelledby="manual-heading">
          <h2 id="manual-heading" className={styles.cardTitle}>
            Enter booking reference
          </h2>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void runLookup(reference, false);
            }}
          >
            <FormField label="Booking reference" htmlFor="checkin-reference" hint={REFERENCE_HINT} error={fieldError} required>
              {({ describedBy }) => (
                <Input
                  id="checkin-reference"
                  value={reference}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="REF-2026-000001"
                  invalid={Boolean(fieldError)}
                  aria-describedby={describedBy}
                  onChange={(e) => setReference(e.target.value)}
                />
              )}
            </FormField>
            <div className={styles.actions}>
              <Button variant="primary" type="submit" disabled={lookup.status === "loading"}>
                {lookup.status === "loading" ? "Looking up…" : "Look Up Appointment"}
              </Button>
              <Button variant="tertiary" type="button" onClick={resetLookup}>
                Clear
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Camera scanner */}
      {mode === "scan" ? (
        <section className={styles.card} aria-labelledby="scan-heading">
          <h2 id="scan-heading" className={styles.cardTitle}>
            Scan QR code
          </h2>
          {!cameraSupported || camera === "unsupported" ? (
            <p className={styles.cameraNote}>
              This browser cannot scan QR codes. Use “Enter reference” — it does exactly the same thing.
            </p>
          ) : camera === "denied" ? (
            <p className={styles.cameraNote}>
              Camera access was blocked. Allow the camera in your browser settings, or use “Enter reference”.
            </p>
          ) : camera === "failed" ? (
            <p className={styles.cameraNote}>The camera could not be started. Use “Enter reference” instead.</p>
          ) : (
            <>
              <div className={styles.videoFrame} data-active={camera === "running"}>
                <video ref={videoRef} className={styles.video} muted playsInline aria-label="Camera preview for QR scanning" />
                {camera !== "running" ? (
                  <p className={styles.videoPlaceholder}>The camera is off. Start it to scan a patient&rsquo;s QR code.</p>
                ) : null}
              </div>
              <div className={styles.actions}>
                {camera === "running" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      stopCamera();
                      setCamera("off");
                    }}
                  >
                    Stop Camera
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={camera === "starting"} onClick={() => void startCamera()}>
                    {camera === "starting" ? "Starting camera…" : "Start Camera"}
                  </Button>
                )}
              </div>
              <p className={styles.cameraNote}>
                The QR code contains only the booking reference — no personal or medical data is stored on it.
              </p>
            </>
          )}
        </section>
      ) : null}

      {/* Appointment search */}
      {mode === "search" ? (
        <section className={styles.card} aria-labelledby="search-heading">
          <h2 id="search-heading" className={styles.cardTitle}>
            Search today&rsquo;s arrivals
          </h2>
          <FormField label="Find an appointment" htmlFor="checkin-search" hint="Search by name, reference or service.">
            {({ describedBy }) => (
              <Input
                id="checkin-search"
                type="search"
                value={searchQuery}
                placeholder="Patient name, reference or service…"
                aria-describedby={describedBy}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            )}
          </FormField>
          {searchResults.length === 0 ? (
            <EmptyState
              title="No one to check in matches"
              body="Only patients who have not yet arrived today appear here."
            />
          ) : (
            <ul className={styles.searchList}>
              {searchResults.map((a) => (
                <li key={a.id}>
                  <button type="button" className={styles.searchRow} onClick={() => void runLookup(a.reference, false)}>
                    <span className={styles.searchTime}>{formatTime(a.time)}</span>
                    <span className={styles.searchBody}>
                      <span className={styles.searchName}>{a.patientName}</span>
                      <span className={styles.searchMeta}>
                        {a.serviceName ?? "Service"} · Ref {a.reference}
                      </span>
                    </span>
                    <StatusBadge tone={DB_STATUS_TONE[a.status]} label={DB_STATUS_LABEL[a.status]} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Lookup result / verify */}
      {lookup.status === "loading" ? <LoadingState label="Looking up the appointment…" /> : null}
      {lookup.status === "error" ? (
        <div className={styles.errorWrap}>
          <ErrorState onRetry={() => void runLookup(reference, false)} />
          <p className={styles.errorMessage} role="alert">
            {lookup.message}
          </p>
        </div>
      ) : null}

      {appointment ? (
        <section className={styles.card} aria-labelledby="verify-heading">
          <h2 id="verify-heading" className={styles.cardTitle}>
            Verify the patient
          </h2>
          <div className={styles.verifyTop}>
            <DoctorPortrait palette={toPalette(appointment.doctorPalette)} size={48} />
            <div className={styles.verifyIdentity}>
              <p className={styles.patientName}>{appointment.patientName}</p>
              <p className={styles.muted}>{appointment.patientPhone ?? "No phone on file"}</p>
            </div>
            <StatusBadge tone={DB_STATUS_TONE[appointment.status]} label={DB_STATUS_LABEL[appointment.status]} />
          </div>
          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>Doctor</dt>
              <dd>{displayDoctorName(appointment.doctorName)}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Service</dt>
              <dd>{appointment.serviceName || "—"}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Date</dt>
              <dd>{formatDate(appointment.date)}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Time</dt>
              <dd>{formatTime(appointment.time)}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Reference</dt>
              <dd>{appointment.reference}</dd>
            </div>
          </dl>

          {appointment.canCheckIn ? (
            <>
              <div className={styles.confirmBlock}>
                <Checkbox
                  id="identity-confirmed"
                  label="I have confirmed this patient's identity against their ID."
                  checked={identityConfirmed}
                  onChange={(e) => setIdentityConfirmed(e.target.checked)}
                />
                <p className={styles.muted}>Check-in stays disabled until identity is confirmed.</p>
              </div>
              <div className={styles.actions}>
                <Button variant="primary" onClick={() => void confirmCheckIn()} disabled={!identityConfirmed || checkingIn}>
                  {checkingIn ? "Checking in…" : "Confirm Check-In"}
                </Button>
                <Button variant="secondary" onClick={resetLookup}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.ineligible} role="alert">
                {ineligibleReason(appointment.status)}
              </p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={resetLookup}>
                  Look Up Another
                </Button>
                <Button variant="tertiary" href="/reception/queue">
                  Open Live Queue
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
