import { requirePatient } from "@/lib/supabase/patient-auth";
import { AppointmentsClient } from "./AppointmentsClient";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  await requirePatient();
  return <AppointmentsClient />;
}
