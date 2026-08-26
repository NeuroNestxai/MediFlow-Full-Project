import { requireReception } from "@/lib/supabase/staff-auth";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

/** Reception — Checkout. Role enforced server-side. */
export default async function ReceptionCheckoutPage() {
  await requireReception();
  return <CheckoutClient />;
}
