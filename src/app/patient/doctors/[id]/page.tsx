import { Button } from "@/components/ui/Button";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { EmptyState } from "@/components/states/StatePanel";
import { StethoscopeIcon } from "@/components/ui/Icons";
import { PatientPage } from "@/components/patient/PatientPage";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { requirePatient } from "@/lib/supabase/patient-auth";
import { getDoctorById } from "@/lib/patient/server-data";
import { toPalette, displayDoctorName } from "@/lib/patient/types";
import type { DirectoryDoctor } from "@/lib/patient/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function DoctorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePatient();
  const { id } = await params;

  let doctor: DirectoryDoctor | null = null;
  let failed = false;
  try {
    doctor = await getDoctorById(id);
  } catch {
    failed = true;
  }

  if (failed || !doctor) {
    return (
      <PatientPage width="default">
        <div className={styles.topBar}>
          <Button variant="tertiary" href="/patient/doctors">
            ← Back to Doctors
          </Button>
        </div>
        <EmptyState
          icon={<StethoscopeIcon />}
          title={failed ? "We couldn't load this doctor" : "Doctor not found"}
          body={
            failed
              ? "Please try again in a moment. Nothing was changed."
              : "This doctor isn't available. Browse the current doctor directory instead."
          }
          action={
            <Button variant="primary" href="/patient/doctors">
              Back to Doctors
            </Button>
          }
        />
      </PatientPage>
    );
  }

  const bookable = doctor.services.length > 0;

  return (
    <PatientPage width="default">
      <div className={styles.topBar}>
        <Button variant="tertiary" href="/patient/doctors">
          ← Back to Doctors
        </Button>
        <TourLauncher tour={PATIENT_TOURS["doctor-profile"]} />
      </div>

      <div className={styles.profileRow} data-tour="profile-identity">
        <DoctorPortrait palette={toPalette(doctor.portraitPalette)} size={120} />
        <div>
          <h1 className={styles.name}>{displayDoctorName(doctor.fullName)}</h1>
          {doctor.gender ? <p className={styles.meta}>{doctor.gender}</p> : null}

          <h2 className={styles.sectionLabel}>Specialties</h2>
          {doctor.specialties.length > 0 ? (
            <div className={styles.tags}>
              {doctor.specialties.map((s) => (
                <span key={s.id} className={styles.tag}>
                  {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.meta}>Specialty not listed.</p>
          )}

          <h2 className={styles.sectionLabel}>Services</h2>
          {bookable ? (
            <>
              <div className={styles.tags}>
                {doctor.services.map((s) => (
                  <span key={s.id} className={styles.tag}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.meta}>No bookable service currently available.</p>
          )}

          <div className={styles.actions}>
            <span data-tour="profile-book">
              {bookable ? (
                <Button variant="primary" href={`/patient/booking?doctorId=${doctor.id}`}>
                  Book Appointment
                </Button>
              ) : (
                <Button variant="primary" disabled>
                  Book Appointment
                </Button>
              )}
            </span>
            <Button variant="secondary" href="/patient/ai-assistant">
              Ask MediFlow
            </Button>
          </div>
        </div>
      </div>
    </PatientPage>
  );
}
