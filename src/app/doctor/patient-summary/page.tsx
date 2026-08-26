import { requireDoctor } from "@/lib/supabase/staff-auth";
import { PatientSummaryClient } from "./PatientSummaryClient";

export const dynamic = "force-dynamic";

/**
 * AI-Organized Patient Summary — server shell.
 * In Next.js 16 `searchParams` is a Promise, so it is awaited here.
 */
export default async function PatientSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  await requireDoctor();
  const sp = await searchParams;
  return <PatientSummaryClient appointmentId={sp.appointment ?? null} />;
}
