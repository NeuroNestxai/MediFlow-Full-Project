import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { StaffProfile } from "@/components/staff/StaffProfile";

export const dynamic = "force-dynamic";

export default async function ReceptionProfilePage() {
  const reception = await requireReception();
  return (
    <StaffPage>
      <StaffPageHeader title="Profile" description="Your MediFlow profile and settings." />
      <StaffProfile
        name={reception.displayName}
        roleLabel="Reception"
        details={[{ label: "Role", value: "Reception" }]}
      />
    </StaffPage>
  );
}
