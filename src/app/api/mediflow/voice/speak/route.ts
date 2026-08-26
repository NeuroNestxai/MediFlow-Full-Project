import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 2000; // matches the existing chat route's own message cap
const ELEVENLABS_TIMEOUT_MS = 30_000;
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs' commonly-used default voice ("Rachel")

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Text-to-speech step of voice mode. Takes MediFlow's already-generated
 * reply text (from /api/mediflow/chat -- the same n8n/Gemini brain text
 * chat uses) and returns spoken audio for the browser to play. Never
 * calls n8n itself, and never receives or forwards any patient identity.
 *
 * ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are read only here on the
 * server. If ELEVENLABS_VOICE_ID isn't set, a default ElevenLabs voice is
 * used -- fine for testing, but picking your own is one setting in the
 * ElevenLabs dashboard once you're ready to choose MediFlow's voice.
 */
export async function POST(request: NextRequest) {
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in to use MediFlow.");
  if (role !== "patient") return err(403, "Voice mode is available to patients only.");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return err(500, "Voice mode isn't available right now.");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid request.");
  }
  const input = body as { text?: unknown };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return err(400, "Nothing to speak.");
  if (text.length > MAX_TEXT) return err(400, "That reply is too long to speak aloud.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    return (e as Error)?.name === "AbortError"
      ? err(504, "That took too long to process. Please try again.")
      : err(502, "We couldn't reach the voice service. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    console.error("ElevenLabs speak failed:", upstream.status, errorText);
    return err(502, "We couldn't generate speech for that reply. Please try again.");
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
