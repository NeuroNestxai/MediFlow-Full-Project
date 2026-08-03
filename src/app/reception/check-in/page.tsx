import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { CalendarIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function ReceptionCheckInPage() {
  await requireReception();
  return (
    <StaffNotice
      title="Check-in"
      description="Bring a patient into the clinic queue."
      icon={<CalendarIcon />}
      panelTitle="Check a patient in"
      panelBody="Scan the patient's QR code, or find their appointment in Appointments and press Check In. Once checked in they appear in the live Queue. Duplicate check-ins are prevented automatically."
      links={[
        { label: "Scan QR", href: "/reception/qr-scan", variant: "primary" },
        { label: "Appointments", href: "/reception/appointments" },
        { label: "Live Queue", href: "/reception/queue" },
      ]}
    />
  );
}
