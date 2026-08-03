import QRCode from "qrcode";
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

  // Generate a real, standards-compliant QR entirely in-app, encoding ONLY the
  // opaque booking reference — no name/contact/doctor/service/date/health/UUID.
  let qrSvg: string | null = null;
  if (appointment && ACTIVE_QR_STATUSES.includes(appointment.status)) {
    try {
      qrSvg = await QRCode.toString(appointment.reference, {
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
