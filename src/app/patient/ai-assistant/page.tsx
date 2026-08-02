import { requirePatient } from "@/lib/supabase/patient-auth";
import { AIAssistantView } from "./AIAssistantView";

export const dynamic = "force-dynamic";

export default async function AIAssistantPage() {
  await requirePatient();
  return <AIAssistantView />;
}
