import { requirePatient, resolveGreetingName } from "@/lib/supabase/patient-auth";
import { DashboardClient } from "./DashboardClient";

// Reads the authenticated user + profile per request — never static.
export const dynamic = "force-dynamic";

export default async function PatientDashboardPage() {
  const { profile } = await requirePatient();
  const greetingName = resolveGreetingName(profile);

  return <DashboardClient greetingName={greetingName} />;
}
