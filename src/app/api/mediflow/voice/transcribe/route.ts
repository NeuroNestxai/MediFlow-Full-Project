import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/supabase/auth-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB -- generous for a short spoken question
const ELEVENLABS_TIMEOUT_MS = 30_000;

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Speech-to-text step of voice mode. Records nothing itself -- the browser
 * sends one already-recorded audio clip, this forwards it to ElevenLabs,
 * and returns the transcribed text only. The MediFlow "brain" (n8n/Gemini)
 * is never called from here -- the browser sends the transcribed text to
 * the existing /api/mediflow/chat route afterward, exactly as typed chat
 * does, so voice and text share one identical conversation path.
 *
 * ELEVENLABS_API_KEY is read only here on the server and never sent to the
 * browser. No patient identity, name, or profile data is ever forwarded to
 * ElevenLabs -- only the raw audio bytes.
 */
export async function POST(request: NextRequest) {
  const { userId, role } = await getAuthenticatedRole();
  if (!userId) return err(401, "Please sign in to use MediFlow.");
  if (role !== "patient") return err(403, "Voice mode is available to patients only.");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return err(500, "Voice mode isn't available right now.");

  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch {
    return err(400, "Invalid request.");
  }

  const audio = incomingForm.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return err(400, "No audio was received. Please try recording again.");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return err(400, "That recording is too long. Please keep questions under about 2 minutes.");
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, "voice-note.webm");
  upstreamForm.append("model_id", "scribe_v1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstreamForm,
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

  if (!upstream.ok) return err(502, "We couldn't understand that recording. Please try again.");

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return err(502, "The voice service returned an unexpected response. Please try again.");
  }

  const text = typeof (data as { text?: unknown })?.text === "string" ? (data as { text: string }).text.trim() : "";
  if (!text) return err(422, "We couldn't make out any words in that recording. Please try again.");

  return NextResponse.json({ text });
}
