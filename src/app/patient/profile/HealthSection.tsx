"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { fetchHealth, saveHealth } from "@/lib/patient/client-data";
import styles from "./page.module.css";

const MAX = 4000;

type Load = "loading" | "ready" | "unavailable" | "error";

export function HealthSection() {
  const allergiesId = useId();
  const medicationsId = useId();

  const [load, setLoad] = useState<Load>("loading");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((res) => {
        if (!active) return;
        if (res.status === "ready") {
          setAllergies(res.allergies);
          setMedications(res.medications);
          setLoad("ready");
        } else {
          setLoad(res.status);
        }
      })
      .catch(() => {
        if (active) setLoad("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (allergies.length > MAX || medications.length > MAX) {
      setError(`Please keep each field under ${MAX} characters.`);
      return;
    }
    setSaving(true);
    const res = await saveHealth({ allergies, medications });
    setSaving(false);
    if (res.ok) {
      setMessage("Your health information has been saved.");
      window.setTimeout(() => setMessage(null), 4000);
    } else if (res.unavailable) {
      setLoad("unavailable");
    } else {
      setError("We couldn't save your health information. Please try again.");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="health-heading">
      <SourceLabel source="patient-reported" />
      <h2 id="health-heading" className={styles.cardTitle}>
        Patient-reported health information
      </h2>
      <p className={styles.cardHint}>
        Entered by you — this is patient-reported and has not been clinically verified. It is not a
        diagnosis or a confirmed medical record. Leaving a field blank is fine.
      </p>

      {load === "loading" && <p className={styles.cardHint}>Loading…</p>}

      {load === "unavailable" && (
        <div className={`${styles.banner}`} role="status">
          Saving health information isn&rsquo;t enabled yet. It will be available once the clinic
          turns this on.
        </div>
      )}

      {load === "error" && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          We couldn&rsquo;t load your health information right now.{" "}
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={{
              marginLeft: 8,
              background: "none",
              border: "none",
              color: "var(--color-action-primary)",
              fontWeight: 700,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {load === "ready" && (
        <form onSubmit={onSubmit} noValidate>
          {message ? (
            <div className={styles.banner} role="status">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              {error}
            </div>
          ) : null}

          <FormField label="Allergies" htmlFor={allergiesId}>
            {({ describedBy }) => (
              <Textarea
                id={allergiesId}
                value={allergies}
                maxLength={MAX}
                onChange={(e) => setAllergies(e.target.value)}
                aria-describedby={describedBy}
                disabled={saving}
                placeholder="e.g. Penicillin — rash (optional)"
              />
            )}
          </FormField>

          <FormField label="Current medications" htmlFor={medicationsId}>
            {({ describedBy }) => (
              <Textarea
                id={medicationsId}
                value={medications}
                maxLength={MAX}
                onChange={(e) => setMedications(e.target.value)}
                aria-describedby={describedBy}
                disabled={saving}
                placeholder="e.g. Metformin 500mg (optional)"
              />
            )}
          </FormField>

          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Health Information"}
          </Button>
        </form>
      )}
    </section>
  );
}
