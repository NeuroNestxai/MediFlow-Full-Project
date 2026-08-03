"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FloOrb, type FloState } from "@/components/ai/FloOrb";
import { ChatBubble, ThinkingBubble } from "@/components/ai/ChatBubble";
import { PromptChip } from "@/components/ai/Chips";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import styles from "./page.module.css";

interface Message {
  id: string;
  sender: "patient" | "ai";
  text: string;
}

const PROMPTS = [
  "What can MediFlow help me with?",
  "I need a dental cleaning.",
  "I need a check-up for my child's teeth.",
  "Which doctors handle chronic care?",
];

const GREETING = "Hello. How can MediFlow guide you today?";
const SAFETY_LINE =
  "MediFlow can help you navigate MCC services and appointments. It does not diagnose, prescribe, assess severity or urgency, perform triage, or provide emergency decisions.";
const PLACEHOLDER = "Ask about MCC services, doctors, or appointments…";
const MAX_MESSAGE = 2000;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const started = messages.length > 0;

  // Auto-scroll to the newest message (ref effect only — no state updates).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [messages, sending, reducedMotion]);

  // Auto-grow the composer to fit its content, capped so it never takes over
  // the screen. Runs whenever the draft changes (incl. reset to empty).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

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
      window.setTimeout(() => setFloState("idle"), 900);
    } catch {
      setError("MediFlow couldn't respond just now. Please try again.");
      setLastFailed(text);
      setFloState("error");
      window.setTimeout(() => setFloState("idle"), 1400);
    } finally {
      setSending(false);
      // Keep the composer usable for the next question.
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || sending || t.length > MAX_MESSAGE) return; // guard empty / busy / over-limit
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
    window.setTimeout(() => textareaRef.current?.focus(), 0);
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

  const nearLimit = draft.length > MAX_MESSAGE - 200;
  const overLimit = draft.length > MAX_MESSAGE;

  const composer = (
    <form
      className={styles.composerForm}
      data-tour="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send(draft);
      }}
    >
      <div className={styles.composer}>
        <label htmlFor={inputId} className="sr-only">
          Type your message. Press Enter to send, Shift+Enter for a new line.
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          className={styles.composerInput}
          placeholder={PLACEHOLDER}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={nearLimit ? `${inputId}-count` : undefined}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={sending || !draft.trim() || overLimit}
          aria-busy={sending}
        >
          {sending ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className={styles.sendGlyph}>
              ↑
            </span>
          )}
          <span>Send</span>
        </button>
      </div>
      {nearLimit ? (
        <p
          id={`${inputId}-count`}
          className={`${styles.counter} ${overLimit ? styles.counterOver : ""}`}
          aria-live="polite"
        >
          {draft.length} / {MAX_MESSAGE}
          {overLimit ? " — message is too long to send" : ""}
        </p>
      ) : null}
    </form>
  );

  const toolbar = (
    <div className={styles.toolbar} data-tour="chat-actions">
      <Button variant="secondary" href="/patient/services">
        Browse Services
      </Button>
      <button type="button" className={styles.toolbarButton} onClick={talkToReception}>
        Talk to Reception
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        onClick={newConversation}
        data-tour="chat-new-conversation"
      >
        New Conversation
      </button>
      <TourLauncher tour={PATIENT_TOURS["ai-assistant"]} label="Tour" />
    </div>
  );

  return (
    <div className={styles.page}>
      {!started ? (
        <section className={styles.intro}>
          <FloOrb state={floState} size={96} reducedMotion={reducedMotion} />
          <h1 className={styles.greeting}>{GREETING}</h1>
          <p className={styles.safety}>{SAFETY_LINE}</p>

          {composer}

          <div className={styles.chips} role="group" aria-label="Suggested questions">
            {PROMPTS.map((p) => (
              <PromptChip key={p} label={p} onClick={() => send(p)} />
            ))}
          </div>

          {toolbar}
        </section>
      ) : (
        <section className={styles.workspace}>
          <header className={styles.workspaceHeader}>
            <FloOrb state={floState} size={34} reducedMotion={reducedMotion} />
            <div className={styles.workspaceTitleWrap}>
              <h1 className={styles.workspaceTitle}>Ask MediFlow</h1>
              <p className={styles.workspaceHint}>
                Navigates MCC services &amp; appointments — no diagnosis or triage.
              </p>
            </div>
          </header>

          <div className={styles.card}>
            <div className={styles.messages} aria-live="polite" aria-busy={sending} data-tour="chat-messages">
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  sender={m.sender}
                  message={m.text}
                  reducedMotion={reducedMotion}
                />
              ))}
              {sending ? <ThinkingBubble reducedMotion={reducedMotion} /> : null}
              {error ? (
                <div className={styles.errorRow} role="alert">
                  <p className={styles.errorText}>{error}</p>
                  <Button variant="secondary" onClick={retry} disabled={sending || !lastFailed}>
                    Retry
                  </Button>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className={styles.composerDock}>{composer}</div>
          </div>

          {toolbar}
        </section>
      )}
    </div>
  );
}
