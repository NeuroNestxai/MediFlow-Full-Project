import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffNotifications } from "@/components/staff/StaffNotifications";

export const dynamic = "force-dynamic";

export default async function ReceptionNotificationsPage() {
  await requireReception();
  return (
    <StaffPage>
      <StaffPageHeader
        title="Notifications"
        description="Front-desk alerts — new bookings, arrivals, cancellations, reschedules and patients ready for checkout. No clinical information appears here."
      />
      <StaffNotifications role="reception" />
    </StaffPage>
  );
}
