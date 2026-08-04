import { Suspense } from "react";
import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { ReceptionBooking } from "@/components/staff/ReceptionBooking";
import { LoadingState } from "@/components/states/StatePanel";

export const dynamic = "force-dynamic";

export default async function ReceptionBookingPage() {
  await requireReception();
  return (
    <StaffPage>
      <StaffPageHeader
        title="Book an Appointment"
        description="Book for a patient against real availability. This creates the same appointment record and booking reference as patient self-booking."
      />
      <Suspense fallback={<LoadingState label="Loading booking…" />}>
        <ReceptionBooking />
      </Suspense>
    </StaffPage>
  );
}
