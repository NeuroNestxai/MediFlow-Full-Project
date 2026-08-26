import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const N8N_TIMEOUT_MS = 30_000;
const ACTIONS = [
  "today_schedule",
  "start_consultation",
  "save_notes",
  "complete_consultation",
  "mark_no_show",
  "create_follow_up",
] as const;
type Action = (typeof ACTIONS)[number];

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const { userId, roles } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in.");
  if (!roles.includes("doctor")) {
    return err(403, "This dashboard is available to doctors only.");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return err(401, "Please sign in.");

  const webhook = process.env.N8N_DOCTOR_WEBHOOK_URL;
  if (!webhook) return err(500, "The doctor dashboard isn't available right now.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid request.");
  }
  const input = body as { action?: unknown; appointment_id?: unknown };

  const action = input.action as Action;
  if (!ACTIONS.includes(action)) return err(400, "Invalid action.");
  if (action !== "today_schedule" && typeof input.appointment_id !== "string") {
    return err(400, "appointment_id is required.");
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

  if (!upstream.ok) return err(502, "We couldn't complete that action. Please try again.");

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return err(502, "Unexpected response. Please try again.");
  }

  return NextResponse.json(data);
}