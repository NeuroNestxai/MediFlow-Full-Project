"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { Button } from "@/components/ui/Button";
import { CalendarIcon, InfoIcon, BellIcon } from "@/components/ui/Icons";
import { PatientPage, PatientPageHeader } from "@/components/patient/PatientPage";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { createClient } from "@/lib/supabase/client";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type PatientNotification,
} from "@/lib/patient/client-data";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; notifications: PatientNotification[] };

type Filter = "all" | "unread";

function relatedHref(n: PatientNotification): string | null {
  if (n.relatedAppointmentId) return "/patient/appointments";
  if (n.relatedDocumentId) return "/patient/documents";
  return null;
}

function typeIcon(type: string) {
  if (type.startsWith("appointment")) return <CalendarIcon />;
  if (type.startsWith("document")) return <InfoIcon />;
  return <BellIcon />;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Bucket a notification by day relative to today (list is already newest-first). */
function bucketOf(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return "Today";
  if (t >= startToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

const BUCKET_ORDER: Array<"Today" | "Yesterday" | "Earlier"> = ["Today", "Yesterday", "Earlier"];

export function NotificationsClient() {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((res) => {
        if (!active) return;
        setState(
          res.status === "ready"
            ? { status: "ready", notifications: res.notifications }
            : { status: res.status },
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
    // Unique topic per subscription: the browser client is a singleton, so a
    // static channel name could collide with another subscriber or a Strict-Mode
    // remount ("cannot add postgres_changes callbacks after subscribe()").
    const topic = `patient-notifications:${
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_notifications" },
        () => setReloadKey((k) => k + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const notifications = useMemo(
    () => (state.status === "ready" ? state.notifications : []),
    [state],
  );
  const unread = notifications.filter((n) => !n.isRead).length;

  const shown = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, filter],
  );

  const groups = useMemo(() => {
    const map: Record<string, PatientNotification[]> = {};
    for (const n of shown) {
      const b = bucketOf(n.createdAt);
      (map[b] ??= []).push(n);
    }
    return BUCKET_ORDER.filter((b) => map[b]?.length).map((b) => ({ label: b, items: map[b] }));
  }, [shown]);

  async function onMarkOne(id: string) {
    await markNotificationRead(id);
    setReloadKey((k) => k + 1);
  }
  async function onMarkAll() {
    await markAllNotificationsRead();
    setReloadKey((k) => k + 1);
  }

  const ready = state.status === "ready";

  return (
    <PatientPage width="default">
      <PatientPageHeader
        title="Notifications"
        description="Updates about your appointments and documents. Operational only — never medical."
        tour={PATIENT_TOURS.notifications}
        actions={
          unread > 0 ? (
            <span data-tour="notif-mark-all">
              <Button variant="secondary" onClick={onMarkAll}>
                Mark all as read
              </Button>
            </span>
          ) : undefined
        }
      />

      {ready && notifications.length > 0 ? (
        <div className={controls.row} role="group" aria-label="Filter notifications" data-tour="notif-filters">
          <button
            type="button"
            className={`${controls.chip} ${filter === "all" ? controls.chipActive : ""}`}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            className={`${controls.chip} ${filter === "unread" ? controls.chipActive : ""}`}
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread ({unread})
          </button>
        </div>
      ) : null}

      {state.status === "loading" && <LoadingState label="Loading notifications…" />}
      {state.status === "error" && <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />}
      {state.status === "unavailable" && (
        <EmptyState
          icon={<BellIcon />}
          title="Notifications aren't enabled yet"
          body="Booking updates will appear here once the clinic turns this on."
        />
      )}
      {ready && notifications.length === 0 && (
        <EmptyState
          icon={<BellIcon />}
          title="You're all caught up"
          body="Updates about your appointments and documents will appear here."
        />
      )}
      {ready && notifications.length > 0 && shown.length === 0 && (
        <EmptyState icon={<BellIcon />} title="No unread notifications" body="You've read everything — nice." />
      )}

      {ready && shown.length > 0 && (
        <div className={styles.groups} aria-live="polite" data-tour="notif-list">
          {groups.map((group) => (
            <section key={group.label} className={styles.group} aria-label={group.label}>
              <h2 className={styles.groupLabel}>{group.label}</h2>
              <ul className={styles.list}>
                {group.items.map((n) => {
                  const href = relatedHref(n);
                  return (
                    <li key={n.id} className={`${styles.item} ${!n.isRead ? styles.unread : ""}`}>
                      <span className={styles.icon} aria-hidden="true">
                        {typeIcon(n.type)}
                      </span>
                      <div className={styles.body}>
                        <p className={styles.itemTitle}>
                          {n.title}
                          {!n.isRead ? (
                            <>
                              <span className={styles.unreadDot} aria-hidden="true" />
                              <span className="sr-only"> (unread)</span>
                            </>
                          ) : null}
                        </p>
                        <p className={styles.itemBody}>{n.message}</p>
                        <p className={styles.itemTime}>{formatWhen(n.createdAt)}</p>
                        <div className={styles.itemActions}>
                          {href ? (
                            <Link href={href} className={styles.action} onClick={() => onMarkOne(n.id)}>
                              View
                            </Link>
                          ) : null}
                          {!n.isRead ? (
                            <button
                              type="button"
                              className={styles.action}
                              onClick={() => onMarkOne(n.id)}
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PatientPage>
  );
}
