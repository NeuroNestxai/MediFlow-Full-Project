export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGE = 2000;
const N8N_TIMEOUT_MS = 120_000;

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Secure proxy: Voice mode -> the dedicated "MediFlow - Voice Intake" n8n
 * workflow (its own Gemini-powered booking agent, completely separate from
 * the text-chat orchestrator).
 *
 * Mirrors /api/mediflow/chat's auth-forwarding pattern exactly: the n8n
 * webhook URL is only read here on the server (N8N_VOICE_WEBHOOK_URL), and
 * the patient's Supabase access token is forwarded as the Authorization
 * header so the workflow's own "Verify Voice Session" step can independently
 * re-check it -- this route never trusts the token itself, just relays it.
 */
export async function POST(request: NextRequest) {
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in to use MediFlow.");
  if (role !== "patient") return err(403, "Voice mode is available to patients only.");

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return err(401, "Please sign in to use MediFlow.");

  const webhook = process.env.N8N_VOICE_WEBHOOK_URL;
  if (!webhook) return err(500, "Voice mode isn't available right now.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid request.");
  }
    const input = body as { message?: unknown; sessionId?: unknown };
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (!message) return err(400, "Enter a message to send.");
    if (message.length > MAX_MESSAGE) {
        return err(400, `Please keep your message under ${MAX_MESSAGE} characters.`);
    }
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ chatInput: message, sessionId }),
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

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return err(502, "MediFlow returned an unexpected response. Please try again.");
  }
  const rawReply = (data as { reply?: unknown })?.reply;
  const reply = typeof rawReply === "string" ? rawReply.trim() : "";
  if (!reply) return err(502, "MediFlow returned an unexpected response. Please try again.");

  return NextResponse.json({ reply });
}