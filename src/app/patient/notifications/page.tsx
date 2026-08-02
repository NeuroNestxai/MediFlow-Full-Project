import { requirePatient } from "@/lib/supabase/patient-auth";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requirePatient();
  return <NotificationsClient />;
}
