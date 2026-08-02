"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SourceLabel } from "@/components/ui/SourceLabel";
import { EmptyState } from "@/components/states/StatePanel";
import { mockFollowUps } from "@/data/mock-follow-ups";
import styles from "./page.module.css";

export function FollowUpView() {
  const [followUps, setFollowUps] = useState(mockFollowUps);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Follow-Up</h1>
      <p className={styles.subtitle}>Instructions approved by your doctor after a visit.</p>

      {followUps.length === 0 ? (
        <EmptyState title="No follow-ups yet" body="Doctor-approved follow-up instructions will appear here." />
      ) : (
        <div className={styles.list}>
          {followUps.map((f) => (
            <article key={f.id} className={styles.card}>
              <SourceLabel source={f.source} />
              <h2 className={styles.cardTitle}>{f.title}</h2>
              <p className={styles.cardBody}>{f.instructions}</p>
              <div className={styles.meta}>
                <span>Due {f.dueDate}</span>
                <span>{f.doctorName}</span>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  onClick={() =>
                    setFollowUps((prev) => prev.map((x) => (x.id === f.id ? { ...x, completed: true } : x)))
                  }
                  disabled={f.completed}
                >
                  {f.completed ? "Confirmed Received" : "Confirm Received"}
                </Button>
                <Button variant="secondary" href="/patient/booking">
                  Book Follow-Up
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
