import { requireDoctor } from "@/lib/supabase/staff-auth";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

/**
 * Doctor Dashboard — server shell. The role and the linked doctor record are
 * resolved here (never in the client), then the live screen is rendered.
 */
export default async function DoctorDashboardPage() {
  const doctor = await requireDoctor();
  return (
    <DashboardClient
      fullName={doctor.fullName}
      portraitPalette={doctor.portraitPalette}
      specialtyNames={doctor.specialtyNames}
    />
  );
}
