import { requireReception } from "@/lib/supabase/staff-auth";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

/**
 * Reception Dashboard — real clinic activity for today.
 * Role and greeting name both come from the server; no mock data anywhere.
 */
export default async function ReceptionDashboardPage() {
  const reception = await requireReception();
  return <DashboardClient displayName={reception.displayName} />;
}
