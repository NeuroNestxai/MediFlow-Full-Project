import { requireDoctor } from "@/lib/supabase/staff-auth";
import { ConsultationClient } from "./ConsultationClient";

export const dynamic = "force-dynamic";

/**
 * Consultation Workspace — server shell.
 * In Next.js 16 `searchParams` is a Promise, so it is awaited here.
 */
export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  await requireDoctor();
  const sp = await searchParams;
  return <ConsultationClient appointmentId={sp.appointment ?? null} />;
}
