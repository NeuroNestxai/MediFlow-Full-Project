import { requireReception } from "@/lib/supabase/staff-auth";
import { QrScanClient } from "./QrScanClient";

export const dynamic = "force-dynamic";

/**
 * Reception — QR Check-In.
 * Role is enforced here on the server; the client component never checks it.
 */
export default async function ReceptionQrScanPage() {
  await requireReception();
  return <QrScanClient />;
}
