"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MicIcon } from "@/components/ui/Icons";
import { FloOrb, type FloState } from "@/components/ai/FloOrb";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import { Toast } from "@/components/ui/Toast";
import styles from "./page.module.css";

interface Message {
  id: string;
  sender: "patient" | "ai";
  text: string;
}

const SAFETY_LINE = "Guides you to care -- never diagnoses, prescribes, or handles emergencies.";

type MicState = "idle" | "requesting" | "recording" | "processing" | "playing" | "denied" | "unsupported";

const BAR_COUNT = 5;

// ---------------------------------------------------------------------------
// Minimal typings for the browser SpeechRecognition API -- used ONLY for
// live on-screen captions while recording. It is not in lib.dom yet and is
// unevenly supported (notably absent in Firefox), so every use is
// feature-detected and captions simply fall back to a static "Listening..."
// label when it's unavailable. The words actually sent to MediFlow always
// come from ElevenLabs' transcription of the recorded audio, never from
// this -- this is a visual-only convenience, not the real transcript.
// ---------------------------------------------------------------------------
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMimeType(): string {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export function VoiceView() {
  const { reducedMotion } = useAccessibility();
  const [floState, setFloState] = useState<FloState>("idle");
  const [micState, setMicState] = useState<MicState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [caption, setCaption] = useState("Tap the microphone and ask a question.");
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [error, setError] = useState<string | null>(null);
  const [showSafetyNotice, setShowSafetyNotice] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [revealProgress, setRevealProgress] = useState(1);

  // Fresh every time this component mounts (i.e. every page load/refresh) --
  // never persisted to sessionStorage/localStorage, so a refresh always
  // starts a brand-new conversation on the backend.
  const sessionIdRef = useRef(crypto.randomUUID());

  const streamRef = useRef<MediaStream | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messages, reducedMotion]);

  const mediaSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window.MediaRecorder === "function";

  // --------------------------------------------------------------------
  // Live frequency visualisation -- real microphone amplitude, not a
  // decorative loop. Reads the raw audio stream via the Web Audio API and
  // redraws BAR_COUNT bars every animation frame while recording; stops
  // and flattens the instant recording stops. Also auto-stops recording
  // after SILENCE_DURATION_MS of quiet once the patient has actually
  // started speaking, so they don't have to tap the mic to end it.
  // --------------------------------------------------------------------
  const stopVisualizer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setLevels(Array(BAR_COUNT).fill(0));
  }, []);

  const startVisualizer = useCallback((stream: MediaStream) => {
    const AudioCtxCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;
    const ctx = new AudioCtxCtor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const bucketSize = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const SILENCE_THRESHOLD = 0.04;
    const SILENCE_DURATION_MS = 3000;
    silenceStartRef.current = null;
    hasSpokenRef.current = false;

    function tick() {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser) return;
      currentAnalyser.getByteFrequencyData(data);
      const bars: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) sum += data[i * bucketSize + j] ?? 0;
        bars.push(Math.min(1, sum / bucketSize / 200));
      }
      setLevels(bars);

      const avgLevel = bars.reduce((a, b) => a + b, 0) / bars.length;
      if (avgLevel >= SILENCE_THRESHOLD) {
        hasSpokenRef.current = true;
        silenceStartRef.current = null;
      } else if (hasSpokenRef.current) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
          recorderRef.current?.stop();
          stopVisualizer();
          try {
            recognitionRef.current?.stop();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, [stopVisualizer]);

  // --------------------------------------------------------------------
  // Live captions -- purely visual feedback while talking. Falls back to
  // a static hint with no error if the browser doesn't support it.
  // --------------------------------------------------------------------
  const startCaptions = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (text.trim()) setCaption(text);
    };
    recognition.onerror = () => {};
    recognition.onend = () => {};
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Some browsers throw if called twice in quick succession -- ignore,
      // captions are a nice-to-have, never the source of truth.
    }
  }, []);

  const stopCaptions = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }, []);

  // Always release the microphone, audio graph, and any playing audio on unmount.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
      stopVisualizer();
      stopCaptions();
    },
    [stopVisualizer, stopCaptions],
  );

  const handleTranscript = useCallback(async (transcript: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-p`, sender: "patient", text: transcript }]);
    setCaption("MediFlow is thinking...");
    setMicState("processing");
    setFloState("thinking");
    setError(null);

    let reply = "";
    try {
      const res = await fetch("/api/mediflow/voice/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: transcript, sessionId: sessionIdRef.current }),
      });
      if (!res.ok) throw new Error("request_failed");
      const data = (await res.json()) as { reply?: unknown };
      reply = typeof data.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("empty_reply");
    } catch (e) {
        console.error("VOICE CONVERSE ERROR:", e);
      setError("MediFlow couldn't respond just now. Please try again.");
      setCaption("Tap the microphone and ask a question.");
      setFloState("error");
      setMicState("idle");
      window.setTimeout(() => setFloState("idle"), 1400);
      return;
    }

    setMessages((prev) => [...prev, { id: `${Date.now()}-ai`, sender: "ai", text: reply }]);
    setCaption(reply);
    setFloState("responding");

    // Speak the reply. If this step fails, the reply still stays on screen
    // as text -- a voice failure should never lose the answer itself.
    try {
      const res = await fetch("/api/mediflow/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply }),
      });
      if (!res.ok) throw new Error("speak_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setMicState("playing");
      setRevealProgress(0);
      audio.ontimeupdate = () => {
        if (audio.duration) setRevealProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setMicState("idle");
        setFloState("idle");
        setCaption("Tap the microphone and ask a question.");
        setRevealProgress(1);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setMicState("idle");
        setFloState("idle");
        setRevealProgress(1);
      };
      await audio.play();
    } catch {
      setMicState("idle");
      setFloState("idle");
    }
  }, []);

  async function transcribeAndSend(blob: Blob) {
    if (blob.size === 0) {
      setMicState("idle");
      setFloState("idle");
      setCaption("Tap the microphone and ask a question.");
      return;
    }
    setMicState("processing");
    setFloState("thinking");
    setCaption("Understanding what you said...");
    try {
      const form = new FormData();
      form.append("audio", blob, "voice-note.webm");
      const res = await fetch("/api/mediflow/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) throw new Error("transcribe_failed");
      const data = (await res.json()) as { text?: unknown };
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) throw new Error("empty_transcript");
      void handleTranscript(text);
    } catch {
      setError("MediFlow couldn't make out that recording. Please try again.");
      setCaption("Tap the microphone and ask a question.");
      setFloState("error");
      setMicState("idle");
      window.setTimeout(() => setFloState("idle"), 1400);
    }
  }

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    stopVisualizer();
    stopCaptions();
  }, [stopVisualizer, stopCaptions]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!mediaSupported) {
      setMicState("unsupported");
      return;
    }
    setMicState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicState("denied");
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      void transcribeAndSend(blob);
    };

    recorder.start();
    setMicState("recording");
    setFloState("listening");
    setCaption("Listening...");
    startVisualizer(stream);
    startCaptions();
  }, [mediaSupported, startVisualizer, startCaptions]);

  function onMicPress() {
    if (micState === "recording") {
      stopRecording();
      return;
    }
    if (micState === "idle" || micState === "denied" || micState === "unsupported") {
      void startRecording();
    }
  }

  const busy = micState === "requesting" || micState === "processing" || micState === "playing";
  const recording = micState === "recording";
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;

  const micUnavailableNote =
    micState === "denied"
      ? "Microphone access was blocked. Allow it in your browser settings, or use text chat instead."
      : micState === "unsupported"
        ? "Voice isn't supported in this browser. Please use text chat instead."
        : null;

  return (
    <div className={styles.page}>
      {showSafetyNotice ? (
        <div className={styles.safetyNotice}>
          <Toast tone="info" message={SAFETY_LINE} onDismiss={() => setShowSafetyNotice(false)} />
        </div>
      ) : null}
      <VoiceDecoration />
      <section className={styles.voiceStage + " " + styles.glassCard} aria-live="polite">
        <div
          style={{
            transform: recording ? "scale(" + (1 + Math.min(avgLevel, 1) * 0.18) + ")" : "scale(1)",
            transition: "transform 90ms linear",
          }}
        >
          <FloOrb state={floState} size={128} reducedMotion={reducedMotion} />
        </div>

        <div className={styles.bars} aria-hidden="true">
          {levels.map((level, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{ transform: `scaleY(${recording ? Math.max(0.12, level) : 0.12})` }}
            />
          ))}
        </div>

        <button
          type="button"
          className={styles.captionLink}
          aria-label="Open this conversation's history"
          onClick={() => setShowHistory(true)}
        >
          <p className={styles.captionBig}>
            {caption.split(" ").map((word, i, arr) => (
              <span
                key={i}
                className={i < Math.floor(arr.length * revealProgress) ? styles.wordRevealed : styles.wordPending}
              >
                {word}
                {i < arr.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        </button>

        {micUnavailableNote ? <p className={styles.micNote}>{micUnavailableNote}</p> : null}
        {error ? (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className={`${styles.micButton} ${recording ? styles.micButtonActive : ""}`}
          onClick={onMicPress}
          disabled={busy}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording" : "Start recording your question"}
        >
          <MicIcon aria-hidden="true" className={styles.micIcon} />
        </button>

      </section>



      {showHistory ? (
        <div className={styles.historyOverlay} role="dialog" aria-modal="true" aria-labelledby="voice-history-heading">
          <div className={styles.historyPanel + " " + styles.glassCard}>
            <div className={styles.historyPanelHead}>
              <h2 id="voice-history-heading" className={styles.historyTitle}>
                This conversation
              </h2>
              <button type="button" className={styles.historyClose} onClick={() => setShowHistory(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <div className={styles.historyList}>
              {messages.length === 0 ? (
                <p className={styles.muted}>Nothing said yet in this conversation.</p>
              ) : (
                messages.map((m) => (
                  <ChatBubble key={m.id} sender={m.sender} message={m.text} reducedMotion={reducedMotion} />
                ))
              )}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        {messages.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              setMessages([]);
              setError(null);
              setMicState("idle");
              setFloState("idle");
              setCaption("Tap the microphone and ask a question.");
              sessionIdRef.current = crypto.randomUUID();
            }}
          >
            New Conversation
          </Button>
        ) : null}
        <Link href="/patient/ai-assistant" className={styles.toolbarButton}>
          Use Text Chat Instead
        </Link>
      </div>
    </div>
  );
}

/** Same calm flowing-path language as the auth pages, static here (no
 * animation) -- a quiet background presence behind the voice workspace
 * rather than something competing for attention while someone's talking. */
function VoiceDecoration() {
  return (
    <svg
      className={styles.decoration}
      viewBox="0 0 900 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="voice-path" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12A9AE" />
          <stop offset="55%" stopColor="#4A6FB0" />
          <stop offset="100%" stopColor="#9179C6" />
        </linearGradient>
      </defs>
      <path
        d="M-20 80 C180 140 160 260 380 290 C600 320 640 200 860 230"
        fill="none"
        stroke="url(#voice-path)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M-20 480 C220 420 260 560 480 540 C700 520 740 620 920 600"
        fill="none"
        stroke="url(#voice-path)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
      />
      <g fill="url(#voice-path)" opacity="0.6">
        <circle cx="120" cy="110" r="4" />
        <circle cx="380" cy="290" r="5" />
        <circle cx="640" cy="200" r="4" />
        <circle cx="260" cy="560" r="4" />
        <circle cx="700" cy="520" r="5" />
      </g>
    </svg>
  );
}