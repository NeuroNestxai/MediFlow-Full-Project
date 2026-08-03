"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/StatePanel";
import { InfoIcon } from "@/components/ui/Icons";
import { PatientPage, PatientPageHeader } from "@/components/patient/PatientPage";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { fetchMyFollowUps, type PatientFollowUp } from "@/lib/patient/client-data";
import { formatDate, displayDoctorName } from "@/lib/patient/types";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; followUps: PatientFollowUp[] };

/**
 * Doctor-approved follow-up instructions.
 *
 * Everything shown here was written and explicitly approved by a clinician —
 * nothing is AI-generated or inferred, which is why each card carries the
 * "Doctor-approved" label. Drafts never reach this screen: the database
 * returns only follow-ups the doctor has approved.
 */
export function FollowUpView() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    void (async () => {
      const result = await fetchMyFollowUps();
      if (result.status === "ready") {
        setState({ status: "ready", followUps: result.followUps });
      } else if (result.status === "unavailable") {
        // Migration not applied yet — an empty list is truer than an error.
        setState({ status: "ready", followUps: [] });
      } else {
        setState({ status: "error" });
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PatientPage width="default">
      <PatientPageHeader
        title="Follow-Up"
        description="Instructions your doctor approved after a visit."
        tour={PATIENT_TOURS["follow-up"]}
      />

      <p className={controls.notice}>
        Only follow-up instructions a doctor has explicitly approved are shown here. Nothing is
        AI-generated or shown before approval.
      </p>

      <div data-tour="followup-list">
        {state.status === "loading" ? <LoadingState label="Loading your follow-ups…" /> : null}

        {state.status === "error" ? (
          <ErrorState
            onRetry={() => {
              setState({ status: "loading" });
              load();
            }}
          />
        ) : null}

        {state.status === "ready" && state.followUps.length === 0 ? (
          <EmptyState
            icon={<InfoIcon />}
            title="No follow-ups yet"
            body="Doctor-approved follow-up instructions will appear here after a visit."
          />
        ) : null}

        {state.status === "ready" && state.followUps.length > 0 ? (
          <div className={styles.list}>
            {state.followUps.map((f) => (
              <article key={f.id} className={styles.card}>
                <SourceLabel source="doctor-approved" />
                <h2 className={styles.cardTitle}>{f.typeLabel}</h2>
                <p className={styles.cardBody}>{f.instructions}</p>
                <div className={styles.meta}>
                  <span>Due {formatDate(f.dueDate)}</span>
                  {f.doctorName ? <span>{displayDoctorName(f.doctorName)}</span> : null}
                </div>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    onClick={() => setConfirmed((prev) => ({ ...prev, [f.id]: true }))}
                    disabled={Boolean(confirmed[f.id])}
                  >
                    {confirmed[f.id] ? "Confirmed Received" : "Confirm Received"}
                  </Button>
                  {f.newAppointmentRequired ? (
                    <Button variant="secondary" href="/patient/booking">
                      Book Follow-Up
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </PatientPage>
  );
}
