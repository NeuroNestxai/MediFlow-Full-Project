import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffProfile } from "@/components/staff/StaffProfile";
import { displayDoctorName } from "@/lib/patient/types";

export const dynamic = "force-dynamic";

export default async function DoctorProfilePage() {
  const doctor = await requireDoctor();
  const details = [
    { label: "Role", value: "Clinician" },
    ...(doctor.specialtyNames.length
      ? [{ label: "Specialties", value: doctor.specialtyNames.join(", ") }]
      : []),
  ];
  return (
    <StaffPage>
      <StaffPageHeader title="Profile" description="Your MediFlow profile and settings." />
      <StaffProfile
        name={displayDoctorName(doctor.fullName)}
        roleLabel="Clinician"
        portraitPalette={doctor.portraitPalette}
        details={details}
      />
    </StaffPage>
  );
}
