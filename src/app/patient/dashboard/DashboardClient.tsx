"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FloOrb } from "@/components/ai/FloOrb";
import { PatientPage, PatientPageHeader, PatientSection } from "@/components/patient/PatientPage";
import { TourInvitation } from "@/components/tour/TourInvitation";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { DoctorDirectoryCard } from "@/components/patient/DoctorDirectoryCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { CalendarIcon, StethoscopeIcon, InfoIcon, BellIcon } from "@/components/ui/Icons";
import {
  fetchDoctors,
  fetchMyAppointments,
  fetchNotifications,
  type PatientNotification,
} from "@/lib/patient/client-data";
import {
  DB_STATUS_LABEL,
  DB_STATUS_TONE,
  formatDate,
  formatTime,
  displayDoctorName,
} from "@/lib/patient/types";
import type { DirectoryDoctor, PatientAppointment } from "@/lib/patient/types";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import styles from "./page.module.css";

const UPCOMING_STATUSES = ["scheduled", "confirmed", "checked_in", "waiting", "in_consultation"];
const QR_ACTIVE_STATUSES = [...UPCOMING_STATUSES, "completed"];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      appointments: PatientAppointment[];
      doctors: DirectoryDoctor[];
      notifications: PatientNotification[];
    };

export function DashboardClient({ greetingName }: { greetingName: string | null }) {
  const router = useRouter();
  const { reducedMotion } = useAccessibility();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    Promise.all([fetchMyAppointments(), fetchDoctors(), fetchNotifications()])
      .then(([appointments, doctors, notif]) => {
        if (!active) return;
        setState({
          status: "ready",
          appointments,
          doctors,
          notifications: notif.status === "ready" ? notif.notifications : [],
        });
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
  const next = upcoming[0] ?? null;
  const recentNotifications = ready ? state.notifications.slice(0, 3) : [];
  const featuredDoctors = ready ? state.doctors.slice(0, 3) : [];

  return (
    <PatientPage width="wide">
      <PatientPageHeader
        title={greetingName ? `Good day, ${greetingName}.` : "Welcome"}
        description="Here's what's happening with your care at MCC Clinic."
        tour={PATIENT_TOURS.dashboard}
      />

      <TourInvitation tour={PATIENT_TOURS.dashboard} />

      {/* 1 — Next appointment */}
      <PatientSection title="Next appointment" id="next-appointment" tourId="patient-next-appointment">
        {state.status === "loading" && <LoadingState label="Loading your appointment…" />}
        {state.status === "error" && <ErrorState onRetry={retry} />}
        {ready && !next && (
          <EmptyState
            icon={<CalendarIcon />}
            title="No upcoming appointments"
            body="When you book a visit, it will appear here with its details and QR code."
            action={
              <Button href="/patient/booking" variant="primary">
                Book an Appointment
              </Button>
            }
          />
        )}
        {ready && next && (
          <article className={styles.nextCard}>
            <div className={styles.nextTop}>
              <div>
                <h3 className={styles.nextDoctor}>
                  {next.doctorName ? displayDoctorName(next.doctorName) : "Doctor"}
                </h3>
                <p className={styles.nextService}>{next.serviceName ?? "Service"}</p>
              </div>
              <StatusBadge tone={DB_STATUS_TONE[next.status]} label={DB_STATUS_LABEL[next.status]} />
            </div>
            <dl className={styles.nextMeta}>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(next.date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{formatTime(next.time)}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{next.reference}</dd>
              </div>
            </dl>
            <div className={styles.nextActions}>
              <Button variant="secondary" onClick={() => router.push("/patient/appointments")}>
                View Details
              </Button>
              {QR_ACTIVE_STATUSES.includes(next.status) ? (
                <Button variant="secondary" href={`/patient/qr?ref=${encodeURIComponent(next.reference)}`}>
                  Show QR
                </Button>
              ) : null}
              <Button variant="tertiary" href="/patient/appointments">
                Manage
              </Button>
            </div>
          </article>
        )}
      </PatientSection>

      {/* 2 — Ask MediFlow */}
      <PatientSection tourId="patient-ask-mediflow">
        <div className={styles.aiCard}>
          <FloOrb state="idle" size={64} reducedMotion={reducedMotion} />
          <div className={styles.aiText}>
            <p className={styles.aiKicker}>MEDIFLOW AI ASSISTANT</p>
            <h2 className={styles.aiTitle}>How can MediFlow guide you today?</h2>
            <p className={styles.aiBody}>
              Find services, doctors and appointments. MediFlow does not diagnose, prescribe, or
              handle emergencies.
            </p>
          </div>
          <Button href="/patient/ai-assistant" variant="primary">
            Ask MediFlow
          </Button>
        </div>
      </PatientSection>

      {/* 3 — Quick actions */}
      <PatientSection title="Quick actions" id="quick-actions" tourId="patient-quick-actions">
        <div className={styles.quickGrid}>
          <QuickAction href="/patient/booking" icon={<CalendarIcon />} label="Book appointment" />
          <QuickAction href="/patient/services" icon={<InfoIcon />} label="Browse services" />
          <QuickAction href="/patient/doctors" icon={<StethoscopeIcon />} label="Find a doctor" />
          <QuickAction href="/patient/appointments" icon={<CalendarIcon />} label="My appointments" />
        </div>
      </PatientSection>

      {/* 4 — Recent notifications */}
      <PatientSection
        title="Recent notifications"
        id="recent-notifications"
        tourId="patient-recent-notifications"
        actions={
          <Link href="/patient/notifications" className={styles.seeAll}>
            View all
          </Link>
        }
      >
        {state.status === "loading" && <LoadingState label="Loading notifications…" />}
        {ready && recentNotifications.length === 0 && (
          <EmptyState
            icon={<BellIcon />}
            title="You're all caught up"
            body="New updates about your appointments and documents will appear here."
          />
        )}
        {ready && recentNotifications.length > 0 && (
          <ul className={styles.notifList}>
            {recentNotifications.map((n) => (
              <li key={n.id} className={`${styles.notifItem} ${n.isRead ? "" : styles.notifUnread}`}>
                <span className={styles.notifIcon} aria-hidden="true">
                  <BellIcon />
                </span>
                <div className={styles.notifText}>
                  <p className={styles.notifTitle}>
                    {n.title}
                    {!n.isRead ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
                  </p>
                  <p className={styles.notifBody}>{n.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PatientSection>

      {/* 5 — Featured doctors (small subset, never the full directory) */}
      <PatientSection
        title="Featured doctors"
        id="featured-doctors"
        actions={
          <Link href="/patient/doctors" className={styles.seeAll}>
            See all doctors
          </Link>
        }
      >
        {state.status === "loading" && <LoadingState label="Loading doctors…" />}
        {ready && featuredDoctors.length === 0 && (
          <EmptyState title="No doctors available" body="Please check back later." />
        )}
        {ready && featuredDoctors.length > 0 && (
          <div className={styles.doctorGrid}>
            {featuredDoctors.map((doctor) => (
              <DoctorDirectoryCard
                key={doctor.id}
                doctor={doctor}
                onViewProfile={() => router.push(`/patient/doctors/${doctor.id}`)}
                onBook={() => router.push(`/patient/booking?doctorId=${doctor.id}`)}
              />
            ))}
          </div>
        )}
      </PatientSection>
    </PatientPage>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className={styles.quickAction}>
      <span className={styles.quickIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.quickLabel}>{label}</span>
    </Link>
  );
}
