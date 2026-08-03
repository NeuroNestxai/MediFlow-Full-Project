import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { CalendarIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function DoctorAvailabilityPage() {
  await requireDoctor();
  return (
    <StaffNotice
      title="Availability"
      icon={<CalendarIcon />}
      panelTitle="Availability is managed by the clinic"
      panelBody="Your bookable hours are configured by MCC and are not editable here. Your confirmed appointments for each day appear on your Schedule."
      links={[{ label: "Go to Schedule", href: "/doctor/schedule", variant: "primary" }]}
    />
  );
}
