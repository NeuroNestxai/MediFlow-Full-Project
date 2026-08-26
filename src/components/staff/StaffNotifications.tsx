"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { BellIcon, InfoIcon } from "@/components/ui/Icons";
import {
  fetchStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  subscribeToStaffNotifications,
  subscribeToAppointments,
} from "@/lib/staff/client-data";
import type { StaffNotification } from "@/lib/staff/types";
import styles from "./StaffNotifications.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; notifications: StaffNotification[] };

type Filter = "all" | "unread";

/** Relative timestamp for a feed row, e.g. "just now", "3 min ago", "Yesterday". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface StaffNotificationsProps {
  role: "doctor" | "reception";
}

/**
 * Shared operational notification feed for Doctor + Reception. RLS decides
 * which rows each role receives; this component never filters for security.
 * Read state is persisted server-side, so it survives a refresh.
 */
export function StaffNotifications({ role }: StaffNotificationsProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: "loading" });
    fetchStaffNotifications()
      .then((result) => {
        if (!activeRef.current) return;
        if (result.status === "ready") setState({ status: "ready", notifications: result.notifications });
        else setState({ status: result.status });
      })
      .catch(() => {
        if (activeRef.current) setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
    // New rows arrive from status transitions on appointments too, so refetch
    // on either channel. Realtime is a progressive enhancement over the fetch.
    const unsubA = subscribeToStaffNotifications(() => load(false));
    const unsubB = subscribeToAppointments(() => load(false));
    return () => {
      activeRef.current = false;
      unsubA();
      unsubB();
    };
  }, [load]);

  const notifications = useMemo(
    () => (state.status === "ready" ? state.notifications : []),
    [state],
  );
  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const rows = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, filter],
  );

  const detailHref = useCallback(
    (n: StaffNotification): string | null => {
      if (!n.relatedAppointmentId) return null;
      return role === "doctor"
        ? `/doctor/patient-summary?appointment=${n.relatedAppointmentId}`
        : `/reception/patients?appointment=${n.relatedAppointmentId}`;
    },
    [role],
  );

  async function markOne(id: string) {
    // Optimistic: flip locally, then persist. A failure simply refetches.
    setState((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            notifications: prev.notifications.map((n) =>
              n.id === id ? { ...n, isRead: true } : n,
            ),
          }
        : prev,
    );
    const result = await markStaffNotificationRead(id);
    if (!result.ok && activeRef.current) load(false);
  }

  async function markAll() {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    const result = await markAllStaffNotificationsRead();
    setBusy(false);
    if (result.ok) {
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", notifications: prev.notifications.map((n) => ({ ...n, isRead: true })) }
          : prev,
      );
    } else {
      load(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <div className={styles.filters} role="group" aria-label="Filter notifications">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : "Unread"}
              {f === "unread" && unreadCount > 0 ? (
                <span className={styles.countPill} aria-label={`${unreadCount} unread`}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void markAll()} disabled={busy || unreadCount === 0}>
          {busy ? "Marking…" : "Mark all as read"}
        </Button>
      </div>

      {state.status === "loading" && <LoadingState label="Loading notifications…" />}
      {state.status === "error" && <ErrorState onRetry={() => load(true)} />}
      {state.status === "unavailable" && (
        <EmptyState
          icon={<InfoIcon />}
          title="Notifications are not enabled yet"
          body="The staff notifications feature has not been switched on for this clinic database yet. Once the database update is applied, operational alerts will appear here automatically."
        />
      )}
      {state.status === "ready" && rows.length === 0 && (
        <EmptyState
          icon={<BellIcon />}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          body={
            filter === "unread"
              ? "You are all caught up. New alerts will appear here as they happen."
              : "Operational alerts about check-ins, bookings and status changes will appear here as they happen."
          }
        />
      )}

      {state.status === "ready" && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((n) => {
            const href = detailHref(n);
            return (
              <li
                key={n.id}
                className={`${styles.item} ${n.isRead ? "" : styles.unread}`}
              >
                <span className={styles.dot} aria-hidden="true" data-unread={!n.isRead} />
                <div className={styles.body}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    {!n.isRead ? <span className={styles.newTag}>New</span> : null}
                  </div>
                  <p className={styles.message}>{n.message}</p>
                  <div className={styles.itemFooter}>
                    <time className={styles.time} dateTime={n.createdAt}>
                      {relativeTime(n.createdAt)}
                    </time>
                    <div className={styles.itemActions}>
                      {href ? (
                        <Link
                          href={href}
                          className={styles.link}
                          onClick={() => {
                            if (!n.isRead) void markOne(n.id);
                          }}
                        >
                          {role === "doctor" ? "Open patient" : "Open appointment"}
                        </Link>
                      ) : null}
                      {!n.isRead ? (
                        <button type="button" className={styles.markBtn} onClick={() => void markOne(n.id)}>
                          Mark read
                        </button>
                      ) : null}
                    </div>
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
