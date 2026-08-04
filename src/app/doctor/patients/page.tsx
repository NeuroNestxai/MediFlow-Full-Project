import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { DoctorPatients } from "@/components/staff/DoctorPatients";

export const dynamic = "force-dynamic";

export default async function DoctorPatientsPage() {
  await requireDoctor();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Patients"
        description="Patients you are treating, reached through their appointments, consultations and follow-ups. Select a patient to see their history and start a consultation."
      />
      <DoctorPatients />
    </StaffPage>
  );
}
