import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  SearchIcon,
  BellIcon,
  AlertTriangleIcon,
  WifiOffIcon,
  LockIcon,
  ClockIcon,
} from "@/components/ui/Icons";
import styles from "./StatePanel.module.css";

export interface StatePanelProps {
  icon: ReactNode;
  title: string;
  body: string;
  dashed?: boolean;
  action?: ReactNode;
}

/** Base panel mirroring the Figma "State Panel" component set: icon +
 * title + supporting text + (usually) a clear next action — never just a
 * blank space or a color change. */
export function StatePanel({ icon, title, body, dashed, action }: StatePanelProps) {
  return (
    <div className={`${styles.panel} ${dashed ? styles.dashed : ""}`} role="status">
      <span className={styles.iconCircle} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <StatePanel
      icon={<SearchIcon />}
      title={label}
      body="Fetching the latest information."
      dashed
    />
  );
}

export function EmptyState({
  title = "Nothing here yet",
  body = "Once there is activity, it will appear here.",
  action,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
}) {
  return <StatePanel icon={<BellIcon />} title={title} body={body} dashed action={action} />;
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StatePanel
      icon={<AlertTriangleIcon />}
      title="Something went wrong"
      body="We could not load this. Nothing was changed — try again."
      action={
        onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            Try Again
          </Button>
        ) : undefined
      }
    />
  );
}

export function OfflineState() {
  return (
    <StatePanel
      icon={<WifiOffIcon />}
      title="No connection"
      body="Reconnecting… any changes you make now will sync once you are back online."
      dashed
    />
  );
}

export function PermissionState() {
  return (
    <StatePanel
      icon={<LockIcon />}
      title="You do not have access"
      body="This information is restricted to authorized staff."
    />
  );
}

export function SessionExpiredState({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <StatePanel
      icon={<ClockIcon />}
      title="Your session has expired"
      body="For your security, please sign in again to continue."
      action={
        onSignIn ? (
          <Button variant="primary" onClick={onSignIn}>
            Sign In Again
          </Button>
        ) : undefined
      }
    />
  );
}
