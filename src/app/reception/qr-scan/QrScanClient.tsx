"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Checkbox } from "@/components/ui/Checkbox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toast } from "@/components/ui/Toast";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { lookupAppointment, checkInAppointment } from "@/lib/staff/client-data";
import type { AppointmentLookup } from "@/lib/staff/types";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  displayDoctorName,
  formatDate,
  formatTime,
  toPalette,
} from "@/lib/patient/types";
import { formatLocalClock } from "@/lib/staff/dates";
import styles from "./page.module.css";

// ---------------------------------------------------------------------------
// Minimal typings for the browser BarcodeDetector API. It is not in lib.dom
// yet and is absent in Safari/Firefox, so every use is feature-detected and
// the camera block simply does not render when it is missing — manual entry
// is the reliable path and is always available.
// ---------------------------------------------------------------------------
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

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; appointment: AppointmentLookup };

type CameraState = "off" | "starting" | "running" | "denied" | "failed" | "unsupported";

/** No-op subscribe: support never changes during a session. */
const NEVER_CHANGES = () => () => {};

interface RecentScan {
  reference: string;
  patientName: string;
  outcome: "checked_in" | "found" | "not_found";
  at: string;
}

interface SuccessInfo {
  reference: string;
  patientName: string;
  at: string;
}

const REFERENCE_HINT = "Example: REF-2026-000001. Case is ignored.";

export function QrScanClient() {
  const [reference, setReference] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const [camera, setCamera] = useState<CameraState>("off");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  // Feature detection without a hydration mismatch: the server snapshot is
  // always `false`, so the camera block only appears once the real browser
  // capabilities are known. Manual entry never depends on this.
  const cameraSupported = useSyncExternalStore(
    NEVER_CHANGES,
    cameraApiAvailable,
    () => false,
  );

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Always release the camera when the screen unmounts.
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

      if (result.ok) {
        setLookup({ status: "ready", appointment: result.appointment });
        setRecent((list) =>
          [
            {
              reference: result.appointment.reference,
              patientName: result.appointment.patientName,
              outcome: "found" as const,
              at: formatLocalClock(),
            },
            ...list,
          ].slice(0, 8),
        );
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
      setRecent((list) =>
        [
          { reference: value, patientName: "—", outcome: "not_found" as const, at: formatLocalClock() },
          ...list,
        ].slice(0, 8),
      );
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
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
      // Autoplay can be refused; the preview still renders once ready.
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
        .catch(() => {
          // A single failed frame is not an error worth surfacing.
        })
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
    setCheckingIn(false);

    if (result.ok) {
      const at = formatLocalClock();
      setSuccess({ reference: result.reference, patientName: appointment.patientName, at });
      setLookup({ status: "idle" });
      setIdentityConfirmed(false);
      setReference("");
      setRecent((list) =>
        [
          {
            reference: result.reference,
            patientName: appointment.patientName,
            outcome: "checked_in" as const,
            at,
          },
          ...list,
        ].slice(0, 8),
      );
      showToast("success", `${result.reference} checked in.`);
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

  const appointment = lookup.status === "ready" ? lookup.appointment : null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>QR Check-In</h1>
          <p className={styles.subtitle}>
            Type the booking reference, or scan the patient&rsquo;s QR code. Operational details only
            &mdash; no clinical information is shown at reception.
          </p>
        </div>
        <Button variant="secondary" href="/reception/queue">
          Open Live Queue
        </Button>
      </header>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      {success ? (
        <section className={styles.successPanel} aria-live="polite">
          <StatusBadge tone="success" label="Checked In" />
          <h2 className={styles.successTitle}>{success.patientName} is checked in</h2>
          <p className={styles.successMeta}>
            Booking reference <strong>{success.reference}</strong> &middot; {success.at}
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

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          {/* Manual entry first — it always works, even with no camera. */}
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
              <FormField
                label="Booking reference"
                htmlFor="booking-reference"
                hint={REFERENCE_HINT}
                error={fieldError}
                required
              >
                {({ describedBy }) => (
                  <Input
                    id="booking-reference"
                    name="booking-reference"
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
                <Button
                  variant="tertiary"
                  type="button"
                  onClick={() => {
                    setReference("");
                    setFieldError(undefined);
                    setLookup({ status: "idle" });
                    setIdentityConfirmed(false);
                  }}
                >
                  Clear
                </Button>
              </div>
            </form>
          </section>

          {/* Camera scanner — optional enhancement, hidden when unavailable. */}
          {cameraSupported ? (
          <section className={styles.card} aria-labelledby="camera-heading">
            <h2 id="camera-heading" className={styles.cardTitle}>
              Scan QR code
            </h2>
            {camera === "unsupported" ? (
              <p className={styles.cameraNote}>
                This browser cannot scan QR codes. Use the booking reference box above &mdash; it does
                exactly the same thing.
              </p>
            ) : camera === "denied" ? (
              <p className={styles.cameraNote}>
                Camera access was blocked. Allow the camera in your browser settings, or keep using the
                booking reference box above.
              </p>
            ) : camera === "failed" ? (
              <p className={styles.cameraNote}>
                The camera could not be started. Use the booking reference box above instead.
              </p>
            ) : (
              <>
                <div className={styles.videoFrame} data-active={camera === "running"}>
                  <video
                    ref={videoRef}
                    className={styles.video}
                    muted
                    playsInline
                    aria-label="Camera preview for QR scanning"
                  />
                  {camera !== "running" ? (
                    <p className={styles.videoPlaceholder}>
                      The camera is off. Start it to scan a patient&rsquo;s QR code.
                    </p>
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
                    <Button
                      variant="secondary"
                      disabled={camera === "starting"}
                      onClick={() => void startCamera()}
                    >
                      {camera === "starting" ? "Starting camera…" : "Start Camera"}
                    </Button>
                  )}
                </div>
                <p className={styles.cameraNote}>
                  The QR code contains only the booking reference &mdash; no personal data is stored on it.
                </p>
              </>
            )}
          </section>
          ) : null}

          {/* Verification + explicit identity confirmation. */}
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
                <StatusBadge
                  tone={DB_STATUS_TONE[appointment.status]}
                  label={DB_STATUS_LABEL[appointment.status]}
                />
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

              <div className={styles.confirmBlock}>
                <Checkbox
                  id="identity-confirmed"
                  label="I have confirmed this patient's identity against their ID."
                  checked={identityConfirmed}
                  onChange={(e) => setIdentityConfirmed(e.target.checked)}
                />
                <p className={styles.muted}>
                  Check-in stays disabled until identity is confirmed.
                </p>
              </div>

              <div className={styles.actions}>
                <Button
                  variant="primary"
                  onClick={() => void confirmCheckIn()}
                  disabled={!identityConfirmed || checkingIn || !appointment.canCheckIn}
                >
                  {checkingIn ? "Checking in…" : "Check In"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLookup({ status: "idle" });
                    setIdentityConfirmed(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {!appointment.canCheckIn ? (
                <p className={styles.muted}>
                  This appointment is {DB_STATUS_LABEL[appointment.status].toLowerCase()}, so it cannot
                  be checked in from here.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className={styles.sideColumn} aria-labelledby="recent-heading">
          <h2 id="recent-heading" className={styles.cardTitle}>
            Recent scans
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No scans yet"
              body="References you look up during this session appear here. The list is not saved."
            />
          ) : (
            <ul className={styles.recentList}>
              {recent.map((scan, index) => (
                <li key={`${scan.reference}-${index}`} className={styles.recentItem}>
                  <div>
                    <p className={styles.recentRef}>{scan.reference}</p>
                    <p className={styles.muted}>
                      {scan.patientName} &middot; {scan.at}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      scan.outcome === "checked_in"
                        ? "success"
                        : scan.outcome === "found"
                          ? "info"
                          : "error"
                    }
                    label={
                      scan.outcome === "checked_in"
                        ? "Checked In"
                        : scan.outcome === "found"
                          ? "Found"
                          : "Not Found"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
