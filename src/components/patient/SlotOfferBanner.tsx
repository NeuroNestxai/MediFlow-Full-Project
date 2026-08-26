"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import {
  fetchMyOpenSlotOffers,
  respondToSlotOffer,
  type PatientSlotOffer,
} from "@/lib/patient/client-data-slot-offers";
import { formatDate, formatTime } from "@/lib/patient/types";
import styles from "./SlotOfferBanner.module.css";

/**
 * Shows the patient's open "earlier slot" offers (if any) with Accept /
 * Decline actions. Place this near the top of the patient dashboard or
 * notifications page -- it renders nothing when there are no open offers.
 *
 * Re-polls periodically so an offer that expires while the page is open
 * disappears on its own (backed by the 30-min server-side expiry sweep) --
 * and a stale expiry is also handled gracefully if the patient acts on one
 * a beat too late (see the "expired" branch in onRespond).
 */
export function SlotOfferBanner() {
  const [offers, setOffers] = useState<PatientSlotOffer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const activeRef = useRef(true);

  const showToast = useCallback((tone: "success" | "error" | "info", msg: string) => {
    setToast({ tone, message: msg });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(() => {
    fetchMyOpenSlotOffers().then((result) => {
      if (activeRef.current) setOffers(result);
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
    };
  }, [load]);

  async function onRespond(offer: PatientSlotOffer, accept: boolean) {
    if (busyId) return;
    setBusyId(offer.offerId);
    const result = await respondToSlotOffer(offer.offerId, accept);
    setBusyId(null);

    if (result.ok) {
      setOffers((prev) => prev.filter((o) => o.offerId !== offer.offerId));
      showToast(
        "success",
        accept
          ? "Got it -- reception will confirm the move shortly."
          : "No problem, your current time is unchanged.",
      );
      return;
    }

    setOffers((prev) => prev.filter((o) => o.offerId !== offer.offerId));
    showToast(
      "info",
      result.reason === "expired" || result.reason === "not_open"
        ? "This offer is no longer available -- it may have expired or already been handled."
        : "Something went wrong. Please refresh and try again.",
    );
  }

  if (offers.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {toast ? <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}
      {offers.map((offer) => (
        <div key={offer.offerId} className={styles.card}>
          <div className={styles.body}>
            <p className={styles.title}>Earlier slot available</p>
            <p className={styles.detail}>
              {offer.doctorName} - {formatDate(offer.offerDate)} at {formatTime(offer.offerTime)}
            </p>
            <p className={styles.expiry}>Offer expires {new Date(offer.expiresAt).toLocaleString()}</p>
          </div>
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => void onRespond(offer, true)}
              disabled={busyId === offer.offerId}
              aria-busy={busyId === offer.offerId}
            >
              {busyId === offer.offerId ? "Working..." : "Move me up"}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => void onRespond(offer, false)}
              disabled={busyId === offer.offerId}
            >
              Keep current time
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}