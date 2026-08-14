"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import {
  completeConsultation,
  createFollowUp,
  fetchAppointmentById,
  fetchConsultation,
  fetchReportedHealth,
  saveConsultationNotes,
  startConsultation,
} from "@/lib/staff/client-data";
import {
  FOLLOW_UP_TYPE_LABEL,
  type FollowUpType,
  type ReportedHealth,
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
import styles from "./page.module.css";

const AUTOSAVE_DELAY_MS = 2000;

const FOLLOW_UP_TYPES = Object.keys(FOLLOW_UP_TYPE_LABEL) as FollowUpType[];

type HealthState =
  | { status: "ready"; health: ReportedHealth | null }
  | { status: "unavailable" }
  | { status: "error" };

type SaveState = "idle" | "saving" | "saved" | "failed";

interface Loaded {
  appointment: StaffAppointment;
  health: HealthState;
  status: DbAppointmentStatus;
  /** null when the consultation could be started (or was already running). */
  blockedMessage: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; data: Loaded };

/**
 * `not_allowed` means the appointment is not in a startable status — which
 * happens both before check-in and after the visit is over. The current status
 * is what tells the doctor which it is, so the message is derived from it
 * rather than assuming the "too early" case.
 */
function startFailureMessage(
  reason: "not_allowed" | "not_found" | "not_linked" | "error",
  status: DbAppointmentStatus,
): string {
  if (reason === "not_allowed") {
    if (status === "completed") return "This consultation is already complete.";
    if (status === "checked_out") return "This visit is finished — the patient has checked out.";
    if (status === "cancelled") return "This appointment was cancelled.";
    if (status === "no_show") return "This appointment was recorded as not attended.";
    return "This patient has not been checked in yet.";
  }
  if (reason === "not_found") return "We could not find this appointment.";
  if (reason === "not_linked")
    return "Your account is not linked to a doctor record, so consultations cannot be opened.";
  return "The consultation could not be opened. Nothing was changed — please try again.";
}

export interface ConsultationClientProps {
  appointmentId: string | null;
}

export function ConsultationClient({ appointmentId }: ConsultationClientProps) {
  const [state, setState] = useState<LoadState>(() =>
    appointmentId ? { status: "loading" } : { status: "missing" },
  );
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );

  const activeRef = useRef(true);
  const savedNotesRef = useRef("");
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(
    (showSpinner: boolean) => {
      if (!appointmentId) {
        setState({ status: "missing" });
        return;
      }
      if (showSpinner) setState({ status: "loading" });
      void (async () => {
      try {
        const appointment = await fetchAppointmentById(appointmentId);
        if (!activeRef.current) return;
        if (!appointment) {
          setState({ status: "missing" });
          return;
        }

        const started = await startConsultation(appointmentId);
        if (!activeRef.current) return;
        let blockedMessage: string | null = null;
        if (!started.ok) {
          blockedMessage = startFailureMessage(started.reason, appointment.status);
          showToast("error", blockedMessage);
        }

        const [healthResult, consultation] = await Promise.all([
          fetchReportedHealth(appointment.patientId),
          fetchConsultation(appointmentId),
        ]);
        if (!activeRef.current) return;

        const health: HealthState =
          healthResult.status === "ready"
            ? { status: "ready", health: healthResult.health }
            : { status: healthResult.status };

        const existingNotes = consultation?.notes ?? "";
        savedNotesRef.current = existingNotes;
        setNotes(existingNotes);
        setCompleted(consultation?.status === "completed" || appointment.status === "completed");

        setState({
          status: "ready",
          data: {
            appointment,
            health,
            status: started.ok ? "in_consultation" : appointment.status,
            blockedMessage,
          },
        });
      } catch {
        if (activeRef.current) setState({ status: "error" });
      }
      })();
    },
    [appointmentId, showToast],
  );

  useEffect(() => {
    activeRef.current = true;
    // Initial state already reflects "loading"/"missing" — no synchronous
    // setState from inside this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const canEdit = state.status === "ready" && !state.data.blockedMessage && !completed;

  // Debounced autosave. The timer is always cleared on unmount and before a
  // new keystroke schedules the next save.
  useEffect(() => {
    if (!appointmentId || !canEdit) return;
    if (notes === savedNotesRef.current) return;
    setSaveState("saving");
    timerRef.current = window.setTimeout(() => {
      const pending = notes;
      saveConsultationNotes(appointmentId, pending).then((result) => {
        if (!activeRef.current) return;
        if (result.ok) {
          savedNotesRef.current = pending;
          setSaveState("saved");
        } else {
          setSaveState("failed");
        }
      });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [notes, appointmentId, canEdit]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function confirmComplete() {
    if (!appointmentId) return;
    setCompleting(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (notes !== savedNotesRef.current) {
      const saved = await saveConsultationNotes(appointmentId, notes);
      if (saved.ok) savedNotesRef.current = notes;
    }
    const result = await completeConsultation(appointmentId);
    if (!activeRef.current) return;
    setCompleting(false);
    setConfirmOpen(false);
    if (result.ok) {
      setCompleted(true);
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", data: { ...prev.data, status: result.status } }
          : prev,
      );
      showToast("success", "Consultation completed. You can create a follow-up now.");
    } else if (result.reason === "not_allowed") {
      showToast("error", "This consultation cannot be completed from its current status.");
    } else if (result.reason === "not_found") {
      showToast("error", "We could not find this appointment.");
    } else {
      showToast("error", "Something went wrong. Nothing was changed — please try again.");
    }
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Draft saved"
        : saveState === "failed"
          ? "Not saved yet — we will retry when you keep typing."
          : "";

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Consultation Workspace</h1>

      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}

      {state.status === "loading" && <LoadingState label="Opening the consultation…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "missing" && (
        <EmptyState
          title="No appointment selected"
          body="Open a patient from today's schedule to start their consultation."
          action={
            <Button variant="primary" href="/doctor/dashboard">
              Back to Dashboard
            </Button>
          }
        />
      )}

      {state.status === "ready" && (
        <>
          {state.data.blockedMessage ? (
            <p className={styles.blocked} role="alert">
              {state.data.blockedMessage}
            </p>
          ) : null}

          <div className={styles.columns}>
            <section className={styles.column} aria-labelledby="summary-heading">
              <h2 id="summary-heading" className={styles.columnTitle}>
                Patient summary
              </h2>
              <p className={styles.patientName}>{state.data.appointment.patientName}</p>
              {state.data.appointment.patientMfId ? (
                <p className={styles.meta}>MediFlow ID {state.data.appointment.patientMfId}</p>
              ) : null}
              <p className={styles.meta}>
                {state.data.appointment.serviceName ?? "Service not recorded"} ·{" "}
                {formatDate(state.data.appointment.date)} ·{" "}
                {formatTime(state.data.appointment.time)}
              </p>
              <p className={styles.meta}>Reference {state.data.appointment.reference}</p>

              <div className={styles.blockHead}>
                <h3 className={styles.blockTitle}>Allergies</h3>
                <SourceLabel source="patient-reported" />
              </div>
              <HealthValue
                health={state.data.health}
                field="allergies"
                emptyLabel="No allergies were reported."
              />

              <div className={styles.blockHead}>
                <h3 className={styles.blockTitle}>Medications</h3>
                <SourceLabel source="patient-reported" />
              </div>
              <HealthValue
                health={state.data.health}
                field="currentMedications"
                emptyLabel="No current medications were reported."
              />

              <Button
                variant="secondary"
                href={`/doctor/patient-summary?appointment=${state.data.appointment.id}`}
              >
                Open Full Summary
              </Button>
            </section>

            <section className={styles.column} aria-labelledby="notes-heading">
              <h2 id="notes-heading" className={styles.columnTitle}>
                Consultation notes
              </h2>
              <p className={styles.meta}>
                Free text written by you. Saved automatically as you type.
              </p>
              <label htmlFor="consultation-notes" className={styles.srOnlyLabel}>
                Consultation notes
              </label>
              <Textarea
                id="consultation-notes"
                rows={14}
                value={notes}
                disabled={!canEdit}
                placeholder="Write your consultation notes here."
                onChange={(e) => setNotes(e.target.value)}
              />
              <p className={styles.saveStatus} aria-live="polite">
                {saveLabel}
              </p>
            </section>

            <section className={styles.column} aria-labelledby="actions-heading">
              <h2 id="actions-heading" className={styles.columnTitle}>
                Status &amp; actions
              </h2>
              <StatusBadge
                tone={DB_STATUS_TONE[state.data.status]}
                label={DB_STATUS_LABEL[state.data.status]}
              />
              {completed ? (
                <p className={styles.meta}>
                  This consultation is complete. Reception will handle checkout.
                </p>
              ) : (
                <p className={styles.meta}>
                  Completing the consultation hands this patient back to reception.
                </p>
              )}
              <Button
                variant="primary"
                onClick={() => setConfirmOpen(true)}
                disabled={!canEdit || completing}
              >
                Complete Consultation
              </Button>
              <Button variant="secondary" href="/doctor/dashboard">
                Back to Dashboard
              </Button>
            </section>
          </div>

          {completed ? (
            <FollowUpForm
              appointmentId={state.data.appointment.id}
              onResult={(tone, message) => showToast(tone, message)}
            />
          ) : null}

          <Dialog
            open={confirmOpen}
            onClose={() => (completing ? undefined : setConfirmOpen(false))}
            title="Complete this consultation?"
            description="Please confirm the checklist below before completing."
          >
            <ul className={styles.checklist}>
              <li>Consultation notes are saved.</li>
              <li>A follow-up can be created after completing.</li>
              <li>Any documents shared for this visit have been reviewed.</li>
              <li>No reception action is required unless you request one.</li>
            </ul>
            <p className={styles.warning} role="note">
              Doctor approval required — this action cannot be undone automatically.
            </p>
            <div className={styles.dialogActions}>
              <Button variant="primary" onClick={confirmComplete} disabled={completing}>
                {completing ? "Completing…" : "Complete Consultation"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={completing}
              >
                Return to Consultation
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}

function HealthValue({
  health,
  field,
  emptyLabel,
}: {
  health: HealthState;
  field: keyof ReportedHealth;
  emptyLabel: string;
}) {
  if (health.status === "unavailable") {
    return <p className={styles.muted}>Patient-reported health is not available on this account.</p>;
  }
  if (health.status === "error") {
    return <p className={styles.muted}>This could not be loaded right now. Nothing was changed.</p>;
  }
  const value = health.health?.[field]?.trim();
  return value ? <p className={styles.body}>{value}</p> : <p className={styles.muted}>{emptyLabel}</p>;
}

function FollowUpForm({
  appointmentId,
  onResult,
}: {
  appointmentId: string;
  onResult: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const today = useMemo(() => localToday(), []);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("recheck");
  const [dueDate, setDueDate] = useState(today);
  const [instructions, setInstructions] = useState("");
  const [setReminder, setSetReminder] = useState(true);
  const [newAppointmentRequired, setNewAppointmentRequired] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"draft" | "approved" | null>(null);

  async function submit(approve: boolean) {
    if (!instructions.trim()) {
      setError("Please write the instructions for this follow-up.");
      return;
    }
    if (dueDate < today) {
      setError("The due date must be today or later.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await createFollowUp({
      appointmentId,
      followUpType,
      dueDate,
      instructions: instructions.trim(),
      setReminder,
      newAppointmentRequired,
      internalNotes: internalNotes.trim() || null,
      approve,
    });
    setBusy(false);
    if (result.ok) {
      setSaved(result.status);
      onResult(
        "success",
        result.status === "approved"
          ? "Follow-up approved and sent to the patient."
          : "Follow-up saved as a draft. The patient cannot see it yet.",
      );
    } else if (result.reason === "invalid") {
      setError("Please check the follow-up type, due date and instructions.");
    } else if (result.reason === "not_allowed") {
      onResult("error", "You are not able to create a follow-up for this appointment.");
    } else {
      onResult("error", "Something went wrong. Nothing was changed — please try again.");
    }
  }

  return (
    <section className={styles.followUp} aria-labelledby="follow-up-heading">
      <h2 id="follow-up-heading" className={styles.columnTitle}>
        Create Follow-Up
      </h2>
      <p className={styles.meta}>
        A draft stays with you. Only <strong>Approve and Send</strong> reaches the patient.
      </p>

      {saved ? (
        <p className={styles.savedNotice} role="status">
          {saved === "approved"
            ? "Follow-up approved and sent to the patient."
            : "Follow-up saved as a draft — the patient cannot see it."}
        </p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Follow-up type</legend>
        <div className={styles.pills}>
          {FOLLOW_UP_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.pill} ${followUpType === t ? styles.pillActive : ""}`}
              aria-pressed={followUpType === t}
              onClick={() => setFollowUpType(t)}
            >
              {FOLLOW_UP_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <FormField
        label="Due date"
        htmlFor="follow-up-due"
        required
        hint="Today or later."
        error={error && error.includes("due date") ? error : undefined}
      >
        {({ describedBy }) => (
          <Input
            id="follow-up-due"
            type="date"
            min={today}
            value={dueDate}
            aria-describedby={describedBy}
            onChange={(e) => setDueDate(e.target.value)}
          />
        )}
      </FormField>

      <FormField
        label="Instructions for the patient"
        htmlFor="follow-up-instructions"
        required
        error={error && error.includes("instructions") ? error : undefined}
      >
        {({ describedBy }) => (
          <Textarea
            id="follow-up-instructions"
            rows={4}
            value={instructions}
            aria-describedby={describedBy}
            onChange={(e) => setInstructions(e.target.value)}
          />
        )}
      </FormField>

      <Checkbox
        id="follow-up-reminder"
        label="Set reminder for patient"
        checked={setReminder}
        onChange={(e) => setSetReminder(e.target.checked)}
      />
      <Checkbox
        id="follow-up-new-appointment"
        label="New appointment required"
        checked={newAppointmentRequired}
        onChange={(e) => setNewAppointmentRequired(e.target.checked)}
      />

      <FormField label="Internal notes (optional)" htmlFor="follow-up-internal">
        {({ describedBy }) => (
          <Textarea
            id="follow-up-internal"
            rows={3}
            value={internalNotes}
            aria-describedby={describedBy}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
        )}
      </FormField>

      {error && !error.includes("due date") && !error.includes("instructions") ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.followUpActions}>
        <Button variant="secondary" onClick={() => submit(false)} disabled={busy}>
          {busy ? "Working…" : "Save Draft"}
        </Button>
        <Button variant="primary" onClick={() => submit(true)} disabled={busy}>
          {busy ? "Working…" : "Approve and Send"}
        </Button>
      </div>
      <p className={styles.sendNotice}>
        Save Draft keeps this private to you. Approve and Send delivers it to the patient.
      </p>
    </section>
  );
}
