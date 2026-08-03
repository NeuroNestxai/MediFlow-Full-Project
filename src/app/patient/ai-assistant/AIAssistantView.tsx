"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FloOrb, type FloState } from "@/components/ai/FloOrb";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { PromptChip } from "@/components/ai/Chips";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import { fetchServices } from "@/lib/patient/client-data";
import type { DirectoryService } from "@/lib/patient/types";
import styles from "./page.module.css";

interface Message {
  id: string;
  sender: "patient" | "ai";
  text: string;
  /** MCC services named in this reply, offered as a booking handover. */
  suggested?: DirectoryService[];
  /** Reply is about booking, but named no service we can resolve exactly. */
  bookingIntent?: boolean;
}

/**
 * Loose comparison key: lowercase, "&" spelled out, punctuation dropped. The
 * assistant writes service names in prose ("cleaning and whitening"), so an
 * exact string match would almost never fire.
 */
function matchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Find the MCC services a reply refers to.
 *
 * Deliberately conservative — it only matches a service the assistant actually
 * named. It never guesses a service from symptoms, because choosing a service
 * from what someone describes is a clinical judgement the assistant is not
 * permitted to make, and a wrong guess here would send a patient to the wrong
 * clinician.
 */
function suggestedServices(reply: string, services: DirectoryService[]): DirectoryService[] {
  const haystack = matchKey(reply);
  const hits = services.filter((s) => {
    const key = matchKey(s.name);
    return key.length > 6 && haystack.includes(key);
  });
  // Longest names first: "braces follow-up" should win over "braces".
  return hits.sort((a, b) => b.name.length - a.name.length).slice(0, 3);
}

/**
 * Is the assistant talking about booking?
 *
 * Used only when no service could be resolved exactly — the patient still gets
 * a way through to the real booking flow instead of a dead end. It offers the
 * service picker rather than choosing on their behalf.
 */
function looksLikeBooking(reply: string): boolean {
  return /\b(book|booking|appointment|schedule|slot|availab)/i.test(reply);
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
  /** MCC service directory, used only to offer a booking handover. */
  const servicesRef = useRef<DirectoryService[]>([]);

  // Load the directory once so replies can be matched to real services. A
  // failure here is silent by design: the chat still works, it simply cannot
  // offer the shortcut.
  useEffect(() => {
    let active = true;
    fetchServices()
      .then((list) => {
        if (active) servicesRef.current = list;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      const suggested = suggestedServices(reply, servicesRef.current);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai`,
          sender: "ai",
          text: reply,
          suggested,
          bookingIntent: suggested.length === 0 && looksLikeBooking(reply),
        },
      ]);
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
            <div key={m.id}>
              <ChatBubble sender={m.sender} message={m.text} />
              {m.suggested?.length || m.bookingIntent ? (
                <div className={styles.handoff}>
                  <p className={styles.handoffNote}>
                    {m.suggested?.length
                      ? "MediFlow can take you to booking. You’ll choose a doctor and a real available time, and nothing is booked until you confirm."
                      : "Appointments are booked in the booking screen, where you’ll see real available times. Nothing is booked from this chat."}
                  </p>
                  <div className={styles.handoffActions}>
                    {m.suggested?.length ? (
                      m.suggested.map((s) => (
                        <Button
                          key={s.id}
                          variant="primary"
                          href={`/patient/booking?serviceId=${encodeURIComponent(s.id)}`}
                        >
                          Book {s.name}
                        </Button>
                      ))
                    ) : (
                      <Button variant="primary" href="/patient/booking">
                        Go to Booking
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
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
