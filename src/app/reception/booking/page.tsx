import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { CalendarIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function ReceptionBookingPage() {
  await requireReception();
  return (
    <StaffNotice
      title="Booking"
      icon={<CalendarIcon />}
      panelTitle="Manage existing appointments"
      panelBody="Appointments are created through the patient booking flow against real availability. Reception can find, check in and manage existing appointments from Appointments and the Queue."
      links={[
        { label: "Appointments", href: "/reception/appointments", variant: "primary" },
        { label: "Live Queue", href: "/reception/queue" },
      ]}
    />
  );
}
