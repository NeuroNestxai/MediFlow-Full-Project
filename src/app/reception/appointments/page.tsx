import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffAppointments } from "@/components/staff/StaffAppointments";

export const dynamic = "force-dynamic";

export default async function ReceptionAppointmentsPage() {
  await requireReception();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Appointments"
        description="Find any appointment by name, reference or service, and check patients in."
      />
      <StaffAppointments role="reception" defaultScope="all" />
    </StaffPage>
  );
}
