import QRCode from "qrcode";
import { requirePatient } from "@/lib/supabase/patient-auth";
import { getAppointmentByReference } from "@/lib/patient/server-data";
import type { PatientAppointment } from "@/lib/patient/types";
import { QRView } from "./QRView";

export const dynamic = "force-dynamic";

// A check-in QR is only meaningful for a still-active visit.
const ACTIVE_QR_STATUSES = ["scheduled", "confirmed", "checked_in"];

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
