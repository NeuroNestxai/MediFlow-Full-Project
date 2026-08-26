import { requirePatient } from "@/lib/supabase/patient-auth";
import { FollowUpView } from "./FollowUpView";

export const dynamic = "force-dynamic";

export default async function FollowUpPage() {
  await requirePatient();
  return <FollowUpView />;
}
