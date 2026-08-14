"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FloOrb } from "@/components/ai/FloOrb";
import { DoctorDirectoryCard } from "@/components/patient/DoctorDirectoryCard";
import { AppointmentListCard } from "@/components/patient/AppointmentListCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { fetchDoctors, fetchMyAppointments } from "@/lib/patient/client-data";
import type { DirectoryDoctor, PatientAppointment } from "@/lib/patient/types";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import styles from "./page.module.css";

// Includes the in-clinic statuses: while a patient is waiting or with the
// doctor, that visit is still the one their dashboard should be showing.
const UPCOMING_STATUSES = [
  "pending_approval",
  "scheduled",
  "confirmed",
  "checked_in",
  "waiting",
  "in_consultation",
];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; appointments: PatientAppointment[]; doctors: DirectoryDoctor[] };

/**
 * Patient Dashboard. The greeting name is resolved server-side; appointments
 * and doctors are live Supabase data.
 */
export function DashboardClient({
  greetingName,
  mfId,
}: {
  greetingName: string | null;
  mfId: string | null;
}) {
  const router = useRouter();
  const { reducedMotion } = useAccessibility();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    Promise.all([fetchMyAppointments(), fetchDoctors()])
      .then(([appointments, doctors]) => {
        if (active) setState({ status: "ready", appointments, doctors });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function retry() {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  const upcoming = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.appointments.filter((a) => UPCOMING_STATUSES.includes(a.status));
  }, [state]);

  const ready = state.status === "ready";
  const nextAppointment = upcoming[0] ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.greeting}>
          {greetingName ? `Good day, ${greetingName}.` : "Welcome"}
        </h1>
        <p className={styles.subGreeting}>
          Here&rsquo;s what&rsquo;s happening with your care at MCC Clinic.
        </p>
        {mfId ? (
          <p className={styles.mfLine}>
            MediFlow ID: <span className={styles.mfValue}>{mfId}</span>
          </p>
        ) : null}
      </div>

      <section className={styles.heroRow} aria-label="MediFlow AI assistant">
        <div className={styles.aiHero}>
          <FloOrb state="idle" size={72} reducedMotion={reducedMotion} />
          <p className={styles.aiKicker}>MEDIFLOW AI ASSISTANT</p>
          <h2 className={styles.aiTitle}>How can MediFlow guide you today?</h2>
          <Button href="/patient/ai-assistant" variant="secondary">
            Ask MediFlow
          </Button>
        </div>
        <div className={styles.countCard}>
          <span className={styles.countNumber}>{ready ? upcoming.length : "—"}</span>
          <p className={styles.countLabel}>Upcoming appointments</p>
          {ready && upcoming.length === 0 ? (
            <Button href="/patient/booking" variant="secondary">
              Book Appointment
            </Button>
          ) : (
            <Button href="/patient/appointments" variant="secondary">
              View All
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="next-appointment-heading">
        <h2 id="next-appointment-heading" className={styles.sectionTitle}>
          Next appointment
        </h2>

        {state.status === "loading" && <LoadingState label="Loading your appointment…" />}
        {state.status === "error" && <ErrorState onRetry={retry} />}
        {ready && !nextAppointment && (
          <EmptyState
            title="No upcoming appointments"
            body="When you book a visit, it will show up here."
            action={
              <Button href="/patient/booking" variant="primary">
                Book an Appointment
              </Button>
            }
          />
        )}
        {ready && nextAppointment && (
          <AppointmentListCard
            appointment={nextAppointment}
            onViewDetails={() => router.push("/patient/appointments")}
          />
        )}
      </section>

      <section aria-labelledby="doctors-heading">
        <h2 id="doctors-heading" className={styles.sectionTitle}>
          Meet our doctors
        </h2>
        {state.status === "loading" && <LoadingState label="Loading doctors…" />}
        {state.status === "error" && <ErrorState onRetry={retry} />}
        {ready && state.doctors.length === 0 && (
          <EmptyState title="No doctors available" body="Please check back later." />
        )}
        {ready && state.doctors.length > 0 && (
          <div className={styles.cardGrid}>
            {state.doctors.map((doctor) => (
              <DoctorDirectoryCard
                key={doctor.id}
                doctor={doctor}
                onViewProfile={() => router.push(`/patient/doctors/${doctor.id}`)}
                onBook={() => router.push(`/patient/booking?doctorId=${doctor.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
