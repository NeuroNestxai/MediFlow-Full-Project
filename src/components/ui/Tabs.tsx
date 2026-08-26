"use client";

import { useState, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTabId?: string;
}

/** Accessible tabs: role="tablist"/"tab"/"tabpanel" wiring plus Left/Right
 * arrow-key navigation between tabs, per the WAI-ARIA tabs pattern. */
export function Tabs({ tabs, defaultTabId }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight") {
      const next = tabs[(index + 1) % tabs.length];
      setActiveId(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    } else if (e.key === "ArrowLeft") {
      const prev = tabs[(index - 1 + tabs.length) % tabs.length];
      setActiveId(prev.id);
      document.getElementById(`tab-${prev.id}`)?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" className={styles.tablist} aria-label="Sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={activeId === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeId === tab.id ? 0 : -1}
            className={cn(styles.tab, activeId === tab.id && styles.active)}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeId !== tab.id}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
