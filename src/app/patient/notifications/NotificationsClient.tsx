"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { createClient } from "@/lib/supabase/client";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type PatientNotification,
} from "@/lib/patient/client-data";
import styles from "./page.module.css";

type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; notifications: PatientNotification[] };

function relatedHref(n: PatientNotification): string | null {
  if (n.relatedAppointmentId) return "/patient/appointments";
  if (n.relatedDocumentId) return "/patient/documents";
  return null;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NotificationsClient() {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((res) => {
        if (!active) return;
        setState(
          res.status === "ready" ? { status: "ready", notifications: res.notifications } : { status: res.status },
        );
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Realtime enhancement — refetch on any change; the list still works via the
  // initial fetch (and manual retry) if Realtime is unavailable.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("patient-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_notifications" }, () => {
        setReloadKey((k) => k + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const notifications = state.status === "ready" ? state.notifications : [];
  const unread = notifications.filter((n) => !n.isRead).length;

  async function onMarkOne(id: string) {
    await markNotificationRead(id);
    setReloadKey((k) => k + 1);
  }
  async function onMarkAll() {
    await markAllNotificationsRead();
    setReloadKey((k) => k + 1);
  }

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <h1 className={styles.title}>Notifications{unread > 0 ? ` (${unread})` : ""}</h1>
        {unread > 0 ? (
          <button type="button" className={styles.markRead} onClick={onMarkAll}>
            Mark All as Read
          </button>
        ) : null}
      </div>

      {state.status === "loading" && <LoadingState label="Loading notifications…" />}
      {state.status === "error" && <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />}
      {state.status === "unavailable" && (
        <EmptyState
          title="Notifications aren't enabled yet"
          body="Booking updates will appear here once the clinic turns this on."
        />
      )}
      {state.status === "ready" && notifications.length === 0 && (
        <EmptyState
          title="No notifications yet"
          body="Booking updates will appear here."
        />
      )}
      {state.status === "ready" && notifications.length > 0 && (
        <ul className={styles.list} aria-live="polite">
          {notifications.map((n) => {
            const href = relatedHref(n);
            return (
              <li key={n.id} className={`${styles.item} ${!n.isRead ? styles.unread : ""}`}>
                <span className={styles.dot} aria-hidden="true" />
                <div>
                  <p className={styles.itemTitle}>
                    {n.title}
                    {!n.isRead ? <span className="sr-only"> (unread)</span> : null}
                  </p>
                  <p className={styles.itemBody}>{n.message}</p>
                  <p className={styles.itemTime}>{formatWhen(n.createdAt)}</p>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    {href ? (
                      <Link href={href} className={styles.markRead} onClick={() => onMarkOne(n.id)}>
                        View
                      </Link>
                    ) : null}
                    {!n.isRead ? (
                      <button type="button" className={styles.markRead} onClick={() => onMarkOne(n.id)}>
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
