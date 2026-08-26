import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const N8N_TIMEOUT_MS = 30_000;
const ACTIONS = ["lookup", "check_in", "check_out", "update_queue"] as const;
type Action = (typeof ACTIONS)[number];

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const { userId, roles } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in.");
  if (!roles.includes("reception")) {
    return err(403, "This dashboard is available to reception staff only.");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return err(401, "Please sign in.");

  const webhook = process.env.N8N_RECEPTION_WEBHOOK_URL;
  if (!webhook) return err(500, "The reception dashboard isn't available right now.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid request.");
  }
  const input = body as {
    action?: unknown;
    reference?: unknown;
    appointment_id?: unknown;
    status?: unknown;
  };

  const action = input.action as Action;
  if (!ACTIONS.includes(action)) return err(400, "Invalid action.");
  if (action === "lookup" && typeof input.reference !== "string") {
    return err(400, "reference is required for lookup.");
  }
  if (["check_in", "check_out", "update_queue"].includes(action) && typeof input.appointment_id !== "string") {
    return err(400, "appointment_id is required.");
  }
  if (action === "update_queue" && typeof input.status !== "string") {
    return err(400, "status is required for update_queue.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    return (e as Error)?.name === "AbortError"
      ? err(504, "The dashboard took too long to respond. Please try again.")
      : err(502, "We couldn't reach the dashboard service. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  const text = await upstream.text();
  

  if (!upstream.ok) return err(502, "We couldn't complete that action. Please try again.");

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return err(502, "Unexpected response. Please try again.");
  }

  return NextResponse.json(data);
}