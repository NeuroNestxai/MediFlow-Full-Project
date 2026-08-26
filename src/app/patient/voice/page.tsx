import { requirePatient } from "@/lib/supabase/patient-auth";
import { VoiceView } from "./VoiceView";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  await requirePatient();
  return <VoiceView />;
}
