import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { ReceptionDoctors } from "@/components/staff/ReceptionDoctors";

export const dynamic = "force-dynamic";

export default async function ReceptionDoctorsPage() {
  await requireReception();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Doctors"
        description="The clinic team at a glance — specialty, today's load, who is in clinic now, and the next open slot. Select a doctor to see their day or start a booking."
      />
      <ReceptionDoctors />
    </StaffPage>
  );
}
