import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { UsersIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function DoctorPatientsPage() {
  await requireDoctor();
  return (
    <StaffNotice
      title="Patients"
      description="Your patients are reached through their appointments."
      icon={<UsersIcon />}
      panelTitle="Open a patient from your schedule"
      panelBody="Select a patient on your Schedule or Appointments to view their appointment details, patient-reported summary, and to start a consultation."
      links={[
        { label: "Go to Schedule", href: "/doctor/schedule", variant: "primary" },
        { label: "All Appointments", href: "/doctor/appointments" },
      ]}
    />
  );
}
