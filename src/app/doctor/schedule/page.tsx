import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffAppointments } from "@/components/staff/StaffAppointments";

export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
  await requireDoctor();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Schedule"
        description="Your appointments. Open a checked-in patient to start a consultation."
      />
      <StaffAppointments role="doctor" defaultScope="today" />
    </StaffPage>
  );
}
