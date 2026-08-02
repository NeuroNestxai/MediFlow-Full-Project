import { Suspense } from "react";
import { requirePatient } from "@/lib/supabase/patient-auth";
import { BookingFlow } from "./BookingFlow";
import { LoadingState } from "@/components/states/StatePanel";

export const dynamic = "force-dynamic";

export default async function BookingPage() {
  await requirePatient();
  return (
    <Suspense fallback={<LoadingState label="Loading booking…" />}>
      <BookingFlow />
    </Suspense>
  );
}
