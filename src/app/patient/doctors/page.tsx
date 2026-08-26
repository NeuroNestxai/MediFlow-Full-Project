import { requirePatient } from "@/lib/supabase/patient-auth";
import { DoctorsClient } from "./DoctorsClient";

export const dynamic = "force-dynamic";

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  await requirePatient();
  const { serviceId } = await searchParams;
  return <DoctorsClient serviceId={serviceId ?? null} />;
}
