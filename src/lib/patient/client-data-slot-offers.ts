/**
 * Slot-offer functions for the patient side.
 *
 * Backed by two existing RPCs:
 *   - agent_list_my_open_offers()  -- RLS-scoped to auth.uid(), only 'offered' and unexpired
 *   - respond_slot_offer(p_offer_id, p_accept) -- accept/decline, declining auto-cascades
 *
 * Conventions follow src/lib/staff/client-data.ts: fresh createClient() per
 * call, RLS decides visibility, every write goes through an RPC, raw
 * Supabase errors are never surfaced to the UI.
 */
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface PatientSlotOffer {
  offerId: string;
  doctorName: string;
  /** ISO date, e.g. "2026-08-25" */
  offerDate: string;
  /** "HH:MM:SS" */
  offerTime: string;
  /** ISO timestamp -- when this offer stops being acceptable. */
  expiresAt: string;
}

interface SlotOfferRow {
  offer_id: string;
  doctor_name: string;
  offer_date: string;
  offer_time: string;
  expires_at: string;
}

/** The patient's own open, unexpired "earlier slot" offers. Empty array on error. */
export async function fetchMyOpenSlotOffers(): Promise<PatientSlotOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("agent_list_my_open_offers");
  if (error) return [];
  return ((data ?? []) as SlotOfferRow[]).map((r) => ({
    offerId: r.offer_id,
    doctorName: r.doctor_name,
    offerDate: r.offer_date,
    offerTime: r.offer_time,
    expiresAt: r.expires_at,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type SlotOfferRespondResult =
  | { ok: true; status: "accepted" | "declined" }
  | { ok: false; reason: "expired" | "not_open" | "not_found" | "error" };

/**
 * Accept or decline an offer. Accepting marks it 'accepted' -- reception then
 * finalizes the move (their own approve/reject step). Declining immediately
 * cascades the offer to the next eligible patient, same as expiry does.
 */
export async function respondToSlotOffer(
  offerId: string,
  accept: boolean,
): Promise<SlotOfferRespondResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("respond_slot_offer", {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("offer_expired")) return { ok: false, reason: "expired" };
    if (msg.includes("offer_not_open")) return { ok: false, reason: "not_open" };
    if (msg.includes("offer_not_found")) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row) return { ok: false, reason: "error" };
  return { ok: true, status: row.status as "accepted" | "declined" };
}