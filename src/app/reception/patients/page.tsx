import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { UsersIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function ReceptionPatientsPage() {
  await requireReception();
  return (
    <StaffNotice
      title="Patients"
      description="Find a patient through their appointment."
      icon={<UsersIcon />}
      panelTitle="Look up a patient"
      panelBody="Scan the patient's check-in QR, or search Appointments by name, booking reference or service. Reception sees only the operational details needed to check a patient in — never private clinical notes."
      links={[
        { label: "Scan QR", href: "/reception/qr-scan", variant: "primary" },
        { label: "Search Appointments", href: "/reception/appointments" },
      ]}
    />
  );
}
