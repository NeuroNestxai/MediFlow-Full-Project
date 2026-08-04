import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffNotifications } from "@/components/staff/StaffNotifications";

export const dynamic = "force-dynamic";

export default async function DoctorNotificationsPage() {
  await requireDoctor();
  return (
    <StaffPage>
      <StaffPageHeader
        title="Notifications"
        description="Operational alerts about your appointments — check-ins, cancellations and schedule changes. No clinical information appears here."
      />
      <StaffNotifications role="doctor" />
    </StaffPage>
  );
}
