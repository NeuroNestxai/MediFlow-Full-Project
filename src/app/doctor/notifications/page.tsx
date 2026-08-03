import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { BellIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function DoctorNotificationsPage() {
  await requireDoctor();
  return (
    <StaffNotice
      title="Notifications"
      icon={<BellIcon />}
      panelTitle="No operational notifications"
      panelBody="You have no notifications right now. Operational alerts about your appointments will appear here once staff notifications are enabled. In the meantime, your Schedule updates live as patients are checked in."
      links={[
        { label: "Go to Schedule", href: "/doctor/schedule", variant: "primary" },
        { label: "Dashboard", href: "/doctor/dashboard" },
      ]}
    />
  );
}
