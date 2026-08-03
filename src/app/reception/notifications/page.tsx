import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { BellIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function ReceptionNotificationsPage() {
  await requireReception();
  return (
    <StaffNotice
      title="Notifications"
      icon={<BellIcon />}
      panelTitle="No operational notifications"
      panelBody="You have no notifications right now. Front-desk alerts will appear here once staff notifications are enabled. The live Queue and Appointments update on their own as patients arrive."
      links={[
        { label: "Live Queue", href: "/reception/queue", variant: "primary" },
        { label: "Dashboard", href: "/reception/dashboard" },
      ]}
    />
  );
}
