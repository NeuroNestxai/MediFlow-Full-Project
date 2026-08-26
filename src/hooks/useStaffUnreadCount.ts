"use client";

import { useEffect, useState } from "react";
import {
  fetchStaffUnreadCount,
  subscribeToStaffNotifications,
  subscribeToAppointments,
} from "@/lib/staff/client-data";

/**
 * Live unread staff-notification count for the signed-in role. RLS scopes the
 * count to the caller (a doctor's own rows, or the shared reception feed).
 * Returns 0 when the feature's table has not been created yet — the badge
 * simply never shows, so the nav can never break on an un-migrated database.
 */
export function useStaffUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetchStaffUnreadCount().then((n) => {
        if (active) setCount(n);
      });
    };
    refresh();
    // New rows can arrive from a notification insert or from an appointment
    // status change that triggers one; refetch on either signal.
    const unsubNotifs = subscribeToStaffNotifications(refresh);
    const unsubAppts = subscribeToAppointments(refresh);
    return () => {
      active = false;
      unsubNotifs();
      unsubAppts();
    };
  }, []);

  return count;
}
