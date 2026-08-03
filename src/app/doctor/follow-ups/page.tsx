import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { DoctorFollowUps } from "@/components/staff/DoctorFollowUps";

export const dynamic = "force-dynamic";

export default async function DoctorFollowUpsPage() {
  await requireDoctor();
  return (
    <StaffPage>
      <StaffPageHeader
        title="Follow-Ups"
        description="Operational follow-ups you recorded after consultations, grouped by when they are due."
      />
      <DoctorFollowUps />
    </StaffPage>
  );
}
