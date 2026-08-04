import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { DoctorConsultationNotes } from "@/components/staff/DoctorConsultationNotes";

export const dynamic = "force-dynamic";

export default async function DoctorConsultationNotesPage() {
  await requireDoctor();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Consultation Notes"
        description="Search and filter the consultations you have authored. Drafts can be continued; completed notes are read-only."
      />
      <DoctorConsultationNotes />
    </StaffPage>
  );
}
