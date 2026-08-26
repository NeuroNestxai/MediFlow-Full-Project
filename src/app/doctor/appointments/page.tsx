import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffAppointments } from "@/components/staff/StaffAppointments";

export const dynamic = "force-dynamic";

export default async function DoctorAppointmentsPage() {
  await requireDoctor();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Appointments"
        description="Search and filter across all of your appointments by date and status."
      />
      <StaffAppointments role="doctor" defaultScope="all" />
    </StaffPage>
  );
}
