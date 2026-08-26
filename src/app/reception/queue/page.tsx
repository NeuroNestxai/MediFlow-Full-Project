import { requireReception } from "@/lib/supabase/staff-auth";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

/** Reception — Live Queue. Role enforced server-side. */
export default async function ReceptionQueuePage() {
  await requireReception();
  return <QueueClient />;
}
