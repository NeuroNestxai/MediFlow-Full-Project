import QRCode from "qrcode";
import { headers } from "next/headers";
import { requirePatient } from "@/lib/supabase/patient-auth";
import { getAppointmentByReference } from "@/lib/patient/server-data";
import type { PatientAppointment } from "@/lib/patient/types";
import { QRView } from "./QRView";

export const dynamic = "force-dynamic";

// The same QR is scanned twice: once by reception to check in, and again to
// check out after the consultation. It must therefore stay active for the
// whole visit — including `completed`, which is exactly when reception scans
// it the second time. Only a finished (`checked_out`) or abandoned visit
// retires the code.
const ACTIVE_QR_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "waiting",
  "in_consultation",
  "completed",
];

export default async function QRPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await requirePatient();
  const { ref } = await searchParams;

  let appointment: PatientAppointment | null = null;
  let failed = false;
  if (ref) {
    try {
      appointment = await getAppointmentByReference(ref);
    } catch {
      failed = true;
    }
  }

  // Generate a real, standards-compliant QR entirely in-app. It encodes a
  // full link to the reception scan screen with ONLY the opaque booking
  // reference as a query param -- no name/contact/doctor/service/date/
  // health/UUID. Encoding a real link (rather than the bare reference) means
  // scanning it with the phone's own camera app opens it directly, which is
  // the only reliable path on iPhone: Safari's engine (which every iOS
  // browser is required to use) has never implemented in-page camera QR
  // detection, so the in-app scanner falls back to manual entry there.
  let qrSvg: string | null = null;
  if (appointment && ACTIVE_QR_STATUSES.includes(appointment.status)) {
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const scanUrl = `${protocol}://${host}/reception/qr-scan?ref=${encodeURIComponent(appointment.reference)}`;
    try {
      qrSvg = await QRCode.toString(scanUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });
    } catch {
      qrSvg = null;
    }
  }

  return <QRView appointment={appointment} failed={failed} qrSvg={qrSvg} />;
}
