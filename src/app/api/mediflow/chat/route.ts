import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Without this, Vercel enforces its own (much shorter) default function
// duration and kills the request before our own timeout below ever
// gets a chance to fire -- Vercel then returns a platform-level 502,
// which looks identical to a real backend failure but isn't one.
export const maxDuration = 120;

const MAX_MESSAGE = 2000;
const SESSION_RE = /^[A-Za-z0-9._-]{1,128}$/;
const N8N_TIMEOUT_MS = 120_000; // raised from 60s -- the summary/doc-writing step can legitimately take longer

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Secure proxy: Patient Ask MediFlow → n8n agent.
 *
 * The n8n webhook URL is read ONLY here on the server (N8N_CHAT_WEBHOOK_URL);
 * it is never sent to the browser. The request body forwarded to n8n is only
 * { action, sessionId, chatInput } — no cookies, email, profile, or raw user
 * IDs. The patient's own Supabase access token IS forwarded, but only as the
 * Authorization header, and only because n8n's own workflow independently
 * re-verifies it against Supabase before doing anything else -- this route
 * never trusts it, just relays it for n8n to check itself. Returns a
 * normalized { reply, sessionId }. Message content is never logged and raw
 * n8n responses/errors are never exposed to the patient.
 */
export async function POST(request: NextRequest) {
  // 1. AuthN + AuthZ (server-side, from public.user_roles via RLS).
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in to use MediFlow.");
  if (role !== "patient") return err(403, "This assistant is available to patients only.");

  // 1b. The n8n workflow independently verifies the caller's identity by
  // revalidating this token against Supabase itself (its own "Verify
  // Supabase Session" step) -- this is never trusted as-is, just forwarded.
  // getSession() reads the already-validated cookie session (refreshed by
  // proxy.ts on every request); n8n does the actual re-verification.
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return err(401, "Please sign in to use MediFlow.");

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
      headers: {
        "Content-Type": "application/json",
        // n8n's Patient Chat workflow now verifies this itself against
        // Supabase before doing anything else -- without it, every request
        // is correctly rejected with a 401 by n8n's own check, not ours.
        Authorization: `Bearer ${accessToken}`,
      },
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
  // n8n's "Respond With Reply" node sends back { reply: "..." } -- reading
  // .output here was a genuine mismatch causing every response to look
  // "unexpected" to this code even when n8n succeeded cleanly.
  const rawReply = (data as { reply?: unknown })?.reply;
  const reply = typeof rawReply === "string" ? rawReply.trim() : "";
  if (!reply) return err(502, "MediFlow returned an unexpected response. Please try again.");

  return NextResponse.json({ reply, sessionId });
}