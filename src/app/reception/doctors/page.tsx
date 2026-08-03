import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { StethoscopeIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function ReceptionDoctorsPage() {
  await requireReception();
  return (
    <StaffNotice
      title="Doctors"
      icon={<StethoscopeIcon />}
      panelTitle="See a doctor's day through Appointments"
      panelBody="To review a doctor's appointments, open Appointments and search by the doctor or service. The live Queue shows who each in-clinic patient is waiting for."
      links={[
        { label: "Appointments", href: "/reception/appointments", variant: "primary" },
        { label: "Live Queue", href: "/reception/queue" },
      ]}
    />
  );
}
