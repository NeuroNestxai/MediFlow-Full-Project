import { requirePatient } from "@/lib/supabase/patient-auth";
import { AccessibilityView } from "./AccessibilityView";

export const dynamic = "force-dynamic";

export default async function AccessibilitySettingsPage() {
  await requirePatient();
  return <AccessibilityView />;
}
