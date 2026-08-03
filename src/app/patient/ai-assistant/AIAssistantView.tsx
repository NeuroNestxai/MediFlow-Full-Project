"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FloOrb, type FloState } from "@/components/ai/FloOrb";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { PromptChip } from "@/components/ai/Chips";
import { useAccessibility } from "@/components/accessibility/AccessibilityProvider";
import {
  fetchServices,
  fetchDoctors,
  fetchAvailableSlots,
  createAppointment,
} from "@/lib/patient/client-data";
import type { DirectoryDoctor, DirectoryService } from "@/lib/patient/types";
import { ChatBookingCard, type BookingState } from "./ChatBookingCard";
import styles from "./page.module.css";

interface Message {
  id: string;
  sender: "patient" | "ai";
  text: string;
  /** MCC services named in this reply, offered as a booking handover. */
  suggested?: DirectoryService[];
  /** Reply is about booking, but named no service we can resolve exactly. */
  bookingIntent?: boolean;
  /** Reply claims an appointment exists. MediFlow has to correct that. */
  falseConfirmation?: boolean;
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

/**
 * Does the reply CLAIM an appointment already exists?
 *
 * The assistant runs its own booking conversation and announces things like
 * "Your appointment is confirmed!" — but it has no access to the database and
 * cannot create anything. A patient who believes that message arrives on a day
 * the clinic has no record of them, which is worse than no booking at all.
 * When this fires and MediFlow has not actually booked, we say so plainly.
 */
function claimsAlreadyBooked(reply: string): boolean {
  // Allow words between the verb and the claim — the assistant writes
  // "is already confirmed", "has been successfully booked", "is now booked".
  // Markdown asterisks are stripped first so **confirmed** still matches.
  const text = reply.replace(/[*_`]/g, "");
  return (
    /\b(is|are|has been|have been|was|were)\b[^.!?\n]{0,40}?\b(confirmed|booked|scheduled)\b/i.test(
      text,
    ) || /\b(appointment|booking)\b[^.!?\n]{0,40}?\bconfirmed\b/i.test(text)
  );
}

/** The doctor a reply names, matched against the real directory. */
function namedDoctor(reply: string, doctors: DirectoryDoctor[]): DirectoryDoctor | null {
  const haystack = matchKey(reply);
  const hits = doctors.filter((d) => {
    // Compare on the name without the honorific — the assistant writes
    // "Dr. Samar Al Sinani", the directory stores "Dr. Samar Al Sinani" or
    // "Samar Al Sinani" depending on the row.
    const key = matchKey(d.fullName.replace(/^dr\.?\s*/i, ""));
    return key.length > 5 && haystack.includes(key);
  });
  return hits.sort((a, b) => b.fullName.length - a.fullName.length)[0] ?? null;
}

/**
 * The date/time the assistant appeared to propose, as `{date, time}` or null.
 * Only used to preselect a slot that we have independently confirmed is free —
 * it is never trusted as a booking on its own.
 */
function proposedDateTime(reply: string): { date: string | null; time: string | null } {
  const iso = reply.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const clock = reply.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let time: string | null = null;
  if (clock) {
    let h = Number(clock[1]);
    const m = clock[2];
    const mer = clock[3]?.toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    time = `${String(h).padStart(2, "0")}:${m}`;
  }
  return { date: iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null, time };
}

/** Max real slots offered inside the chat before sending them to the full flow. */
const CHAT_SLOT_LIMIT = 6;

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
  /** MCC directory, used only to resolve what a reply names. */
  const servicesRef = useRef<DirectoryService[]>([]);
  const doctorsRef = useRef<DirectoryDoctor[]>([]);

  /** Booking offer attached to the most recent reply, if one could be resolved. */
  const [booking, setBooking] = useState<BookingState | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  /**
   * Recent turns from BOTH sides.
   *
   * A booking is agreed across a conversation, not in one sentence — by the
   * time the assistant says "what is your name?", the service and doctor were
   * settled two turns earlier. Resolving against only the last reply misses
   * almost every real booking.
   */
  const historyRef = useRef<string[]>([]);
  /** Conversation text behind the current offer, so picking a service can
   *  still preselect the time the assistant proposed. */
  const lastReplyRef = useRef("");

  // Load the directory once so replies can be matched to real services and
  // doctors. A failure here is silent by design: the chat still works, it
  // simply cannot offer the booking shortcut.
  useEffect(() => {
    let active = true;
    Promise.all([fetchServices(), fetchDoctors()])
      .then(([s, d]) => {
        if (!active) return;
        servicesRef.current = s;
        doctorsRef.current = d;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /**
   * Turn a reply into a bookable offer.
   *
   * Nothing the assistant says is trusted. The doctor and service must resolve
   * to real directory rows, and the times come from `get_available_slots_v2`
   * — so an invented or already-taken time can never be offered.
   */
  const openBooking = useCallback(
    async (service: DirectoryService | null, doctor: DirectoryDoctor, reply: string) => {
      setSlotId(null);
      lastReplyRef.current = reply;

      // No single service resolved → let the patient choose from the ones this
      // doctor actually offers, rather than inferring one from what they said.
      if (!service) {
        const byId = new Map(servicesRef.current.map((s) => [s.id, s]));
        const offered = doctor.services
          .map((ref) => byId.get(ref.id))
          .filter((s): s is DirectoryService => Boolean(s));
        setBooking({ status: "chooseService", doctor, services: offered });
        return;
      }

      setBooking({ status: "resolving", service, doctor });
      try {
        const all = await fetchAvailableSlots(doctor.id, service.id);
        if (!all.length) {
          setBooking({ status: "unavailable", service, doctor });
          return;
        }
        const want = proposedDateTime(reply);
        const proposed =
          all.find(
            (s) =>
              (!want.date || s.date === want.date) &&
              (!want.time || s.time.slice(0, 5) === want.time),
          ) ?? null;
        // Show the proposed slot first when it is genuinely free, then the
        // next real openings.
        const rest = all.filter((s) => s.availabilityId !== proposed?.availabilityId);
        const slots = (proposed ? [proposed, ...rest] : rest).slice(0, CHAT_SLOT_LIMIT);
        setSlotId(proposed?.availabilityId ?? null);
        setBooking({ status: "ready", service, doctor, slots, proposed });
      } catch {
        setBooking({ status: "unavailable", service, doctor });
      }
    },
    [],
  );

  const confirmBooking = useCallback(async () => {
    if (!booking || booking.status !== "ready" || !slotId) return;
    const { service, doctor } = booking;
    setBooking({ status: "booking", service, doctor });
    const result = await createAppointment({
      doctorId: doctor.id,
      serviceId: service.id,
      availabilityId: slotId,
      notes: null,
    });
    if (result.ok) {
      setBooking({
        status: "booked",
        service,
        doctor,
        reference: result.reference,
        date: result.date,
        time: result.time,
      });
    } else {
      setBooking({ status: "failed", service, doctor, conflict: result.conflict });
    }
  }, [booking, slotId]);

  const chooseService = useCallback(
    (service: DirectoryService) => {
      if (!booking) return;
      void openBooking(service, booking.doctor, lastReplyRef.current);
    },
    [booking, openBooking],
  );

  const reopenBooking = useCallback(() => {
    if (!booking || booking.status === "chooseService") return;
    void openBooking(booking.service, booking.doctor, "");
  }, [booking, openBooking]);

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
      historyRef.current = [...historyRef.current, reply].slice(-8);
      // Resolve against the recent conversation, newest first, so the most
      // recently named service/doctor wins if the patient changed their mind.
      const context = [...historyRef.current].reverse().join("\n");
      const suggested = suggestedServices(context, servicesRef.current);
      const doctor = namedDoctor(context, doctorsRef.current);
      // Service + doctor both resolved → offer booking right here in the chat.
      // Otherwise fall back to the pre-filled booking flow, or the picker.
      // A named doctor is enough to start. The assistant frequently speaks in
      // specialties ("General & Chronic Care") rather than MCC service names,
      // so requiring an exact service match meant the card almost never
      // appeared — and the patient was left with the assistant's word that
      // something was booked when nothing was.
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai`,
          sender: "ai",
          text: reply,
          suggested: doctor ? [] : suggested,
          bookingIntent: !doctor && suggested.length === 0 && looksLikeBooking(reply),
          falseConfirmation: claimsAlreadyBooked(reply),
        },
      ]);
      if (doctor) {
        void openBooking(suggested.length === 1 ? suggested[0] : null, doctor, context);
      } else {
        setBooking(null);
      }
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
    // The patient's own words matter for resolution: they are usually the one
    // who names the service ("I want Cleaning & whitening"), and matching a
    // service name the patient typed themselves is not the assistant guessing.
    historyRef.current = [...historyRef.current, t].slice(-8);
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
    // A new conversation must not inherit the previous one's service/doctor,
    // or the next booking offer could be for the wrong appointment entirely.
    historyRef.current = [];
    setBooking(null);
    setSlotId(null);
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
              {/* The assistant announced a booking it cannot make. Say so
                  immediately, next to the claim — a patient who believes it
                  arrives on a day the clinic has no record of them. */}
              {m.falseConfirmation && booking?.status !== "booked" ? (
                <div className={styles.notBooked} role="alert">
                  <strong>Not booked yet.</strong> MediFlow has no appointment for you from this
                  message. Nothing is reserved until you confirm a time below and see a booking
                  reference.
                </div>
              ) : null}
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
          {booking ? (
            <ChatBookingCard
              state={booking}
              selectedId={slotId}
              onSelect={setSlotId}
              onSelectService={chooseService}
              onConfirm={() => void confirmBooking()}
              onRetry={reopenBooking}
            />
          ) : null}
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
