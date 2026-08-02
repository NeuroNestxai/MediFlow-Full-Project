import { notFound } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import styles from "./page.module.css";

// Never statically render or execute this during `next build` — the checks
// make live network calls and depend on the request-time cookie store.
export const dynamic = "force-dynamic";

/** Safe, non-sensitive statuses. Never carries keys, tokens, env values,
 * URLs, records, or private error text. */
type Status = "ok" | "warn" | "fail";

interface CheckResult {
  label: string;
  status: Status;
  detail: string;
}

/**
 * Runs the Supabase connection checks and maps every outcome to a small set
 * of safe, human-readable statuses. Nothing sensitive is ever returned:
 * no keys, tokens, environment values, project URL, profile records, or
 * detailed private error messages.
 */
async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Configuration presence (booleans only — values are never read out).
  if (!isSupabaseConfigured()) {
    results.push({
      label: "Configuration",
      status: "fail",
      detail: "Configuration missing",
    });
    return results;
  }
  results.push({
    label: "Configuration",
    status: "ok",
    detail: "Connected",
  });

  const supabase = await createClient();

  // 2. Authentication service availability. `getUser()` reaches the auth
  // server; a missing/absent session is still a healthy, reachable service.
  // Only a transport-level failure counts as unreachable.
  try {
    await supabase.auth.getUser();
    results.push({
      label: "Authentication",
      status: "ok",
      detail: "Auth reachable",
    });
  } catch {
    results.push({
      label: "Authentication",
      status: "fail",
      detail: "Connection failed",
    });
    // If auth transport failed, the DB check will too — but attempt it so the
    // report is complete.
  }

  // 3. Safe query against public.profiles. We only ever read whether the
  // request succeeded, was blocked by RLS, or failed to connect — never the
  // returned rows.
  try {
    const { error } = await supabase.from("profiles").select("*").limit(1);

    if (!error) {
      results.push({
        label: "Profiles query",
        status: "ok",
        detail: "Profiles query successful",
      });
    } else if (isRlsError(error.code)) {
      results.push({
        label: "Profiles query",
        status: "warn",
        detail: "Profiles query blocked by RLS",
      });
    } else {
      results.push({
        label: "Profiles query",
        status: "fail",
        detail: "Connection failed",
      });
    }
  } catch {
    results.push({
      label: "Profiles query",
      status: "fail",
      detail: "Connection failed",
    });
  }

  return results;
}

/**
 * Recognizes Postgres/PostgREST codes that indicate the request reached the
 * database but was denied by Row Level Security / permissions, as opposed to
 * a connection problem. Only the code (never the message) is inspected.
 */
function isRlsError(code: string | undefined): boolean {
  if (!code) return false;
  // 42501: insufficient_privilege (Postgres). PGRST301/PGRST116: PostgREST
  // permission / not-accessible responses that surface when RLS blocks a read.
  return code === "42501" || code === "PGRST301" || code === "PGRST116";
}

const STATUS_SYMBOL: Record<Status, string> = {
  ok: "✓",
  warn: "!",
  fail: "✕",
};

/**
 * Development-only Supabase connection check.
 *
 * Not available in production builds — returns a 404 there so it can never be
 * reached in a deployed environment.
 */
export default async function SupabaseCheckPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const results = await runChecks();

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Supabase Connection Check</h1>
      <p className={styles.subtitle}>
        Development-only diagnostic. Shows connection status only — no keys,
        tokens, environment values, URLs, or records are displayed.
      </p>

      <ul className={styles.list}>
        {results.map((result) => (
          <li key={result.label} className={styles.item} data-status={result.status}>
            <span className={styles.symbol} aria-hidden="true">
              {STATUS_SYMBOL[result.status]}
            </span>
            <span className={styles.label}>{result.label}</span>
            <span className={styles.detail}>{result.detail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
