import { Button } from "@/components/ui/Button";
import { DoctorPortrait } from "@/components/ui/DoctorPortrait";
import { EmptyState } from "@/components/states/StatePanel";
import { requirePatient } from "@/lib/supabase/patient-auth";
import { getDoctorById } from "@/lib/patient/server-data";
import { toPalette, displayDoctorName, PROTOTYPE_MAPPING_NOTICE } from "@/lib/patient/types";
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
      <div className={styles.page}>
        <Button variant="tertiary" href="/patient/doctors">
          ← Back to Doctors
        </Button>
        <EmptyState
          title={failed ? "We couldn't load this doctor" : "Doctor not found"}
          body={
            failed
              ? "Please try again in a moment."
              : "This doctor isn't available. Browse the current doctor directory instead."
          }
        />
      </div>
    );
  }

  const bookable = doctor.services.length > 0;

  return (
    <div className={styles.page}>
      <Button variant="tertiary" href="/patient/doctors">
        ← Back to Doctors
      </Button>

      <div className={styles.profileRow}>
        <DoctorPortrait palette={toPalette(doctor.portraitPalette)} size={120} />
        <div>
          <h1 className={styles.name}>{displayDoctorName(doctor.fullName)}</h1>
          {doctor.gender ? <p className={styles.meta}>{doctor.gender}</p> : null}
          <p className={styles.protoNote}>
            Prototype portrait — an approved MCC photograph may be added later.
          </p>

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
              <p className={styles.protoNote}>{PROTOTYPE_MAPPING_NOTICE}</p>
            </>
          ) : (
            <p className={styles.meta}>No bookable service currently available.</p>
          )}

          <div className={styles.actions}>
            {bookable ? (
              <Button variant="primary" href={`/patient/booking?doctorId=${doctor.id}`}>
                Book Appointment
              </Button>
            ) : (
              <Button variant="primary" disabled>
                Book Appointment
              </Button>
            )}
            <Button variant="secondary" href="/patient/ai-assistant">
              Ask MediFlow
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
