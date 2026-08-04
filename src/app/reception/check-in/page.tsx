import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { CheckInWorkspace } from "@/components/staff/CheckInWorkspace";

export const dynamic = "force-dynamic";

export default async function ReceptionCheckInPage() {
  await requireReception();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Check-In"
        description="Bring a patient into the clinic. Scan their QR, enter a booking reference, or search today's arrivals — then confirm identity to check them in."
      />
      <CheckInWorkspace />
    </StaffPage>
  );
}
