import { requireDoctor } from "@/lib/supabase/staff-auth";
import { StaffNotice } from "@/components/staff/StaffNotice";
import { StethoscopeIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function DoctorConsultationNotesPage() {
  await requireDoctor();
  return (
    <StaffNotice
      title="Consultation notes"
      icon={<StethoscopeIcon />}
      panelTitle="Notes are written during a consultation"
      panelBody="Consultation notes are entered on the consultation screen for a checked-in patient, where they save as a draft and are finalised when you complete the consultation. Open a patient from your Schedule to begin."
      links={[{ label: "Go to Schedule", href: "/doctor/schedule", variant: "primary" }]}
    />
  );
}
