import { requirePatient } from "@/lib/supabase/patient-auth";
import { ServicesClient } from "./ServicesClient";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await requirePatient();
  return <ServicesClient />;
}
