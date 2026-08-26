import { requirePatient } from "@/lib/supabase/patient-auth";
import { DocumentsView } from "./DocumentsView";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requirePatient();
  return <DocumentsView />;
}
