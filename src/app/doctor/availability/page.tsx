import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { DoctorAvailability } from "@/components/staff/DoctorAvailability";

export const dynamic = "force-dynamic";

export default async function DoctorAvailabilityPage() {
  await requireDoctor();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Availability"
        description="Manage your bookable hours. Add or block time, and turn slots on or off — changes take effect in patient booking immediately."
      />
      <DoctorAvailability />
    </StaffPage>
  );
}
