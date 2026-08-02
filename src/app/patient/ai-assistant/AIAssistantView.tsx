"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FloOrb, type FloState } from "@/components/ai/FloOrb";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { PromptChip } from "@/components/ai/Chips";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import styles from "./page.module.css";

interface Message {
  id: string;
  sender: "patient" | "ai";
  text: string;
}

const PROMPTS = [
  "Hello, what can you help me with?",
  "I need a dental cleaning.",
  "I need a check-up for my child's teeth.",
  "Which doctors handle chronic care?",
];

const SAFETY_LINE =
  "MediFlow can help you navigate MCC services and appointments. It does not diagnose, prescribe, assess severity or urgency, perform triage, or provide emergency decisions.";

const SESSION_KEY = "mediflow_chat_session";

/** Per-tab chat session id. Random only — never a user id/email/reference/PHI.
 * sessionStorage keeps it stable across refreshes in the same tab; a new tab
 * starts fresh. Read/created only in event handlers (client-only). */
function currentSession(): string {
  let s = window.sessionStorage.getItem(SESSION_KEY);
  if (!s) {
    s = `mediflow-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

export function AIAssistantView() {
  const { reducedMotion } = useAccessibility();
  const [floState, setFloState] = useState<FloState>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const inputId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message (ref effect only — no state updates).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messages, sending, reducedMotion]);

  async function callApi(text: string) {
    setSending(true);
    setFloState("thinking");
    setError(null);
    try {
      const res = await fetch("/api/mediflow/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: currentSession() }),
      });
      if (!res.ok) throw new Error("request_failed");
      const data = (await res.json()) as { reply?: unknown };
      const reply = typeof data.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("empty_reply");
      setMessages((prev) => [...prev, { id: `${Date.now()}-ai`, sender: "ai", text: reply }]);
      setLastFailed(null);
      setFloState("responding");
      window.setTimeout(() => setFloState("idle"), 800);
    } catch {
      setError("MediFlow couldn't respond just now. Please try again.");
      setLastFailed(text);
      setFloState("idle");
    } finally {
      setSending(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || sending) return; // duplicate-submission prevention
    setMessages((prev) => [...prev, { id: `${Date.now()}-p`, sender: "patient", text: t }]);
    setDraft("");
    void callApi(t);
  }

  function retry() {
    if (lastFailed && !sending) void callApi(lastFailed);
  }

  function newConversation() {
    window.sessionStorage.setItem(SESSION_KEY, `mediflow-${crypto.randomUUID()}`);
    setMessages([]);
    setDraft("");
    setError(null);
    setLastFailed(null);
    setFloState("idle");
  }

  function talkToReception() {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-r`,
        sender: "ai",
        text: "You can reach MCC reception in person at the clinic. An online reception chat isn't available yet.",
      },
    ]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  const started = messages.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <FloOrb state={started ? floState : "idle"} size={72} reducedMotion={reducedMotion} />
        <h1 className={styles.title}>
          {started ? "Ask MediFlow" : "Hello. How can MediFlow guide you today?"}
        </h1>
        <p className={styles.subtitle}>{SAFETY_LINE}</p>
      </div>

      {started ? (
        <div className={styles.chatLog} aria-live="polite" aria-busy={sending}>
          {messages.map((m) => (
            <ChatBubble key={m.id} sender={m.sender} message={m.text} />
          ))}
          {sending ? (
            <p className={styles.subtitle} role="status">
              MediFlow is typing…
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            color: "var(--color-danger-strong, #b91c1c)",
            fontSize: 13,
          }}
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={retry} disabled={sending || !lastFailed}>
            Retry
          </Button>
        </div>
      ) : null}

      <form
        className={styles.askBar}
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Type your message. Press Enter to send, Shift+Enter for a new line.
        </label>
        <textarea
          id={inputId}
          className={styles.askInput}
          placeholder="Describe what you need…"
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <Button variant="primary" type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </form>

      {!started ? (
        <div className={styles.chipRow}>
          {PROMPTS.map((p) => (
            <PromptChip key={p} label={p} onClick={() => send(p)} />
          ))}
        </div>
      ) : null}

      <div className={styles.footerLinks}>
        <Button variant="secondary" href="/patient/services">
          Browse All Services
        </Button>
        <button type="button" className={styles.linkButton} onClick={talkToReception}>
          Talk to Reception
        </button>
        <button type="button" className={styles.linkButton} onClick={newConversation}>
          Start New Conversation
        </button>
        <Button variant="tertiary" href="/patient/dashboard">
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
