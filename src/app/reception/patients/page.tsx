import { Suspense } from "react";
import { requireReception } from "@/lib/supabase/staff-auth";
import { StaffPage, StaffPageHeader } from "@/components/staff/StaffPage";
import { ReceptionPatients } from "@/components/staff/ReceptionPatients";
import { LoadingState } from "@/components/states/StatePanel";

export const dynamic = "force-dynamic";

export default async function ReceptionPatientsPage() {
  await requireReception();
  return (
    <StaffPage width="wide">
      <StaffPageHeader
        title="Patients"
        description="Look up any patient by name, phone or booking reference. Open a patient to see their appointments and check them in."
      />
      <Suspense fallback={<LoadingState label="Loading patients…" />}>
        <ReceptionPatients />
      </Suspense>
    </StaffPage>
  );
}
