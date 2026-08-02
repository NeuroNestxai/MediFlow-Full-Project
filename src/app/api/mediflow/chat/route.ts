import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 2000;
const SESSION_RE = /^[A-Za-z0-9._-]{1,128}$/;
const N8N_TIMEOUT_MS = 30_000;

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Secure proxy: Patient Ask MediFlow → n8n agent.
 *
 * The n8n webhook URL is read ONLY here on the server (N8N_CHAT_WEBHOOK_URL);
 * it is never sent to the browser. We forward only { action, sessionId,
 * chatInput } — no cookies, Supabase tokens, email, profile, or user IDs — and
 * return a normalized { reply, sessionId }. Message content is never logged and
 * raw n8n responses/errors are never exposed to the patient.
 */
export async function POST(request: NextRequest) {
  // 1. AuthN + AuthZ (server-side, from public.user_roles via RLS).
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in to use MediFlow.");
  if (role !== "patient") return err(403, "This assistant is available to patients only.");

  // 2. Server-only configuration.
  const webhook = process.env.N8N_CHAT_WEBHOOK_URL;
  if (!webhook) return err(500, "The assistant isn't available right now.");

  // 3. Validate the request — accept ONLY message + sessionId.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid request.");
  }
  const input = body as { message?: unknown; sessionId?: unknown };

  const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
  if (!SESSION_RE.test(sessionId)) return err(400, "Invalid session.");

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) return err(400, "Enter a message to send.");
  if (message.length > MAX_MESSAGE) {
    return err(400, `Please keep your message under ${MAX_MESSAGE} characters.`);
  }

  // 4. Forward to n8n in the confirmed format, with a timeout. No auth/PII sent.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput: message }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    return (e as Error)?.name === "AbortError"
      ? err(504, "MediFlow took too long to respond. Please try again.")
      : err(502, "We couldn't reach MediFlow. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) return err(502, "We couldn't reach MediFlow. Please try again.");

  // 5. Parse + normalize — treat the reply as plain text only.
  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return err(502, "MediFlow returned an unexpected response. Please try again.");
  }
  const output = (data as { output?: unknown })?.output;
  const reply = typeof output === "string" ? output.trim() : "";
  if (!reply) return err(502, "MediFlow returned an unexpected response. Please try again.");

  return NextResponse.json({ reply, sessionId });
}
