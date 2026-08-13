"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * MediFlow — public landing page (shown before sign in / sign up).
 *
 * Self-contained on purpose: all styles live in the <style> block below
 * so this is a single file to drop in. Everything interactive here is a
 * PREVIEW only — the real assistant, booking and voice unlock after a
 * visitor creates an account. Doctor portraits are friendly cartoon SVGs
 * standing in for real photos for now. Motion is fully disabled for
 * anyone using reduced-motion (media query + the app's data attribute).
 * ------------------------------------------------------------------ */

type AvatarStyle = "hijab" | "short" | "ghutra" | "bun" | "glasses" | "beard";

type Doc = {
  name: string;
  specialty: string;
  skin: string;
  hair: string;
  bg: string;
  style: AvatarStyle;
  open: boolean;
};

// Sample (fake) doctors — placeholders until real profiles/photos are wired.
const DOCTORS: Doc[] = [
  { name: "Dr. Layla Al-Balushi", specialty: "Cardiology", skin: "#e8b98f", hair: "#0a767b", bg: "#e6f4f4", style: "hijab", open: true },
  { name: "Dr. Omar Al-Hinai", specialty: "Dermatology", skin: "#d8a373", hair: "#2e2a26", bg: "#efebf9", style: "beard", open: false },
  { name: "Dr. Aisha Al-Farsi", specialty: "Pediatrics", skin: "#f0c9a5", hair: "#7458b0", bg: "#f0ecf9", style: "hijab", open: true },
  { name: "Dr. Yusuf Al-Riyami", specialty: "Orthopedics", skin: "#c98b5c", hair: "#1f2540", bg: "#eef0f8", style: "ghutra", open: true },
  { name: "Dr. Mariam Al-Saidi", specialty: "Neurology", skin: "#e8b98f", hair: "#3b2a1a", bg: "#fbece9", style: "bun", open: false },
  { name: "Dr. Khalid Al-Amri", specialty: "ENT", skin: "#d8a373", hair: "#2e2a26", bg: "#e6f4f4", style: "glasses", open: true },
  { name: "Dr. Noor Al-Habsi", specialty: "Dentistry", skin: "#f0c9a5", hair: "#903228", bg: "#efebf9", style: "hijab", open: true },
  { name: "Dr. Salim Al-Maawali", specialty: "General Medicine", skin: "#c98b5c", hair: "#1f2540", bg: "#eef0f8", style: "short", open: false },
];

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const attr = document.documentElement.getAttribute("data-reduced-motion") === "true";
  return Boolean(mq || attr);
}

/* ---------- Cartoon doctor avatar (pure SVG) ---------- */
function DoctorAvatar({ doc, size = 96 }: { doc: Doc; size?: number }) {
  const { skin, hair, bg, style } = doc;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="mf-ava">
      <defs>
        <clipPath id={`clip-${doc.name.replace(/\W/g, "")}`}>
          <circle cx="60" cy="60" r="58" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill={bg} />
      <g clipPath={`url(#clip-${doc.name.replace(/\W/g, "")})`}>
        {/* lab coat */}
        <path d="M14 122 C14 96 36 84 60 84 C84 84 106 96 106 122 Z" fill="#ffffff" />
        <path d="M60 84 L52 104 L60 112 L68 104 Z" fill="#eef0f8" />
        {/* stethoscope */}
        <path d="M48 88 C48 104 56 108 60 108 C64 108 72 104 72 92" fill="none" stroke="#0a767b" strokeWidth="3" strokeLinecap="round" />
        <circle cx="72" cy="90" r="4" fill="#12a9ae" />
        {/* neck */}
        <rect x="52" y="70" width="16" height="18" rx="7" fill={skin} />
        {/* head */}
        <circle cx="60" cy="50" r="27" fill={skin} />
        {/* hair / head-covering by style */}
        {style === "short" && <path d="M33 48 C33 30 47 22 60 22 C73 22 87 30 87 48 C82 40 72 36 60 36 C48 36 38 40 33 48 Z" fill={hair} />}
        {style === "beard" && (
          <>
            <path d="M34 46 C34 30 47 23 60 23 C73 23 86 30 86 46 C80 39 71 36 60 36 C49 36 40 39 34 46 Z" fill={hair} />
            <path d="M38 54 C40 72 50 80 60 80 C70 80 80 72 82 54 C74 62 66 64 60 64 C54 64 46 62 38 54 Z" fill={hair} opacity="0.9" />
          </>
        )}
        {style === "glasses" && (
          <>
            <path d="M33 48 C33 30 47 22 60 22 C73 22 87 30 87 48 C82 40 72 36 60 36 C48 36 38 40 33 48 Z" fill={hair} />
            <g fill="none" stroke="#1f2540" strokeWidth="2.5">
              <circle cx="49" cy="52" r="8" />
              <circle cx="71" cy="52" r="8" />
              <path d="M57 52 H63" />
            </g>
          </>
        )}
        {style === "ghutra" && (
          <>
            <path d="M30 44 C30 24 44 16 60 16 C76 16 90 24 90 44 L90 40 C90 30 76 26 60 26 C44 26 30 30 30 40 Z" fill="#ffffff" />
            <path d="M28 42 C28 30 42 22 60 22 C78 22 92 30 92 42 L92 58 C86 44 74 40 60 40 C46 40 34 44 28 58 Z" fill="#ffffff" />
            <rect x="30" y="30" width="60" height="7" rx="3" fill="#111827" />
          </>
        )}
        {style === "bun" && (
          <>
            <circle cx="60" cy="24" r="9" fill={hair} />
            <path d="M33 50 C33 30 47 24 60 24 C73 24 87 30 87 50 C82 42 72 38 60 38 C48 38 38 42 33 50 Z" fill={hair} />
          </>
        )}
        {style === "hijab" && (
          <path d="M30 52 C30 26 44 16 60 16 C76 16 90 26 90 52 C90 66 84 74 84 74 L80 68 C80 46 72 34 60 34 C48 34 40 46 40 68 L36 74 C36 74 30 66 30 52 Z" fill={hair} />
        )}
        {/* face */}
        <circle cx="50" cy="52" r="2.6" fill="#1f2540" />
        <circle cx="70" cy="52" r="2.6" fill="#1f2540" />
        <path d="M45 46 C47 44 52 44 54 46" fill="none" stroke="#1f2540" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M66 46 C68 44 73 44 75 46" fill="none" stroke="#1f2540" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M53 62 C57 66 63 66 67 62" fill="none" stroke="#b05a4e" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke="rgba(31,37,64,0.06)" strokeWidth="2" />
    </svg>
  );
}

/* ---------- Flo orb ---------- */
function FloOrb({ size = 120, state = "idle" }: { size?: number; state?: string }) {
  return (
    <div className="mf-orb-wrap" style={{ width: size, height: size }} data-state={state}>
      <span className="mf-orb-ring" />
      <span className="mf-orb" />
      <span className="mf-orb-dot" />
    </div>
  );
}

/* ---------- Count-up number ---------- */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      setN(to);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const start = performance.now();
            const dur = 1400;
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / dur);
              setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

/* ---------- Phone preview screens ---------- */
function PhoneChat() {
  return (
    <div className="mf-scr">
      <div className="mf-scr-head">
        <FloOrb size={34} />
        <div>
          <strong>Ask MediFlow</strong>
          <span>Navigates MCC services — no diagnosis</span>
        </div>
      </div>
      <div className="mf-chat">
        <div className="mf-b mf-b-ai">Welcome to MediFlow AI 👋 How can I help you today?</div>
        <div className="mf-b mf-b-me">I&apos;ve had a headache for 2 weeks</div>
        <div className="mf-b mf-b-ai">
          Thanks for sharing. That sounds like something a <b>Neurology</b> consultant can look into. Want me to find a slot?
        </div>
        <div className="mf-typing" aria-hidden="true"><span /><span /><span /></div>
      </div>
      <div className="mf-inputbar mf-locked" title="Create an account to chat live">
        <span>Ask about services, doctors, appointments…</span>
        <span className="mf-lock">🔒</span>
      </div>
    </div>
  );
}

function PhoneBook() {
  return (
    <div className="mf-scr">
      <div className="mf-scr-title">Book an appointment</div>
      <div className="mf-doclist">
        {DOCTORS.slice(0, 3).map((d) => (
          <div className="mf-docrow" key={d.name}>
            <DoctorAvatar doc={d} size={40} />
            <div className="mf-docmeta">
              <strong>{d.name}</strong>
              <span>{d.specialty}</span>
            </div>
            {d.open ? <span className="mf-avail">Today</span> : <span className="mf-full">Full</span>}
          </div>
        ))}
      </div>
      <div className="mf-slots">
        {["09:00", "10:30", "13:15", "16:00"].map((s, i) => (
          <span className={`mf-slot ${i === 1 ? "mf-slot-sel" : ""}`} key={s}>
            {s}
          </span>
        ))}
      </div>
      <button className="mf-scr-cta mf-locked" title="Create an account to book">
        Confirm booking <span className="mf-lock">🔒</span>
      </button>
    </div>
  );
}

function PhoneVoice() {
  return (
    <div className="mf-scr mf-scr-voice">
      <FloOrb size={96} state="listening" />
      <div className="mf-wave" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <p className="mf-voice-cap">
        Voice intake <span className="mf-lock">🔒</span>
      </p>
      <p className="mf-voice-sub">Speak your symptoms — unlocks after sign in.</p>
    </div>
  );
}

/* ============================ PAGE ============================ */
export default function LandingPage() {
  const [tab, setTab] = useState<"chat" | "book" | "voice">("chat");
  const [userPicked, setUserPicked] = useState(false);
  const phoneRef = useRef<HTMLDivElement>(null);

  // Auto-cycle the phone tabs until the visitor interacts.
  useEffect(() => {
    if (userPicked || reducedMotion()) return;
    const order: Array<"chat" | "book" | "voice"> = ["chat", "book", "voice"];
    const id = setInterval(() => {
      setTab((t) => order[(order.indexOf(t) + 1) % order.length]);
    }, 4200);
    return () => clearInterval(id);
  }, [userPicked]);

  // Scroll reveal.
  useEffect(() => {
    if (reducedMotion()) {
      document.querySelectorAll(".mf-reveal").forEach((el) => el.classList.add("mf-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("mf-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll(".mf-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Subtle tilt on the phone.
  function onTilt(e: MouseEvent<HTMLDivElement>) {
    if (reducedMotion() || !phoneRef.current) return;
    const r = phoneRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    phoneRef.current.style.setProperty("--rx", `${(-py * 6).toFixed(2)}deg`);
    phoneRef.current.style.setProperty("--ry", `${(px * 8).toFixed(2)}deg`);
  }
  function resetTilt() {
    if (!phoneRef.current) return;
    phoneRef.current.style.setProperty("--rx", "0deg");
    phoneRef.current.style.setProperty("--ry", "0deg");
  }

  function pick(t: "chat" | "book" | "voice") {
    setUserPicked(true);
    setTab(t);
  }

  return (
    <div className="mf-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---------- Nav ---------- */}
      <header className="mf-nav">
        <div className="mf-nav-in">
          <div className="mf-brand">
            <FloOrb size={30} />
            <span className="mf-brand-name">MediFlow<span>AI</span></span>
          </div>
          <div className="mf-serving">
            <span className="mf-mcc-dots" aria-hidden="true"><i /><i /><i /><i /></span>
            Now serving MCC
          </div>
          <nav className="mf-nav-cta">
            <Link href="/auth/sign-in" className="mf-btn mf-btn-ghost">Sign in</Link>
            <Link href="/auth/patient/sign-up" className="mf-btn mf-btn-primary">Create account</Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mf-hero">
        <span className="mf-blob mf-blob-a" aria-hidden="true" />
        <span className="mf-blob mf-blob-b" aria-hidden="true" />
        <div className="mf-hero-in">
          <div className="mf-hero-copy mf-reveal">
            <div className="mf-pill">
              <span className="mf-pulse" /> Live at MCC · Medical Consultants Clinics
            </div>
            <h1>
              Care, <span className="mf-grad">navigated.</span><br />
              Your clinic&apos;s calm, smart front desk.
            </h1>
            <p>
              MediFlow guides every visit at MCC — ask a question, find the right consultant,
              book a slot, and check in with a tap. Meet <b>Flo</b>, your AI guide.
            </p>
            <div className="mf-hero-btns">
              <Link href="/auth/patient/sign-up" className="mf-btn mf-btn-primary mf-btn-lg">Get started — it&apos;s free</Link>
              <Link href="/auth/sign-in" className="mf-btn mf-btn-outline mf-btn-lg">I already have an account</Link>
            </div>
            <div className="mf-trustchips">
              <span>🔒 Encrypted records</span>
              <span>🧠 AI sees symptoms, not your name</span>
              <span>🛡️ MFA &amp; audit trail</span>
            </div>
          </div>

          {/* ---------- Interactive phone ---------- */}
          <div className="mf-hero-phone mf-reveal">
            <div
              className="mf-phone"
              ref={phoneRef}
              onMouseMove={onTilt}
              onMouseLeave={resetTilt}
            >
              <div className="mf-phone-notch" />
              <div className="mf-phone-screen">
                {tab === "chat" && <PhoneChat />}
                {tab === "book" && <PhoneBook />}
                {tab === "voice" && <PhoneVoice />}
              </div>
            </div>
            <div className="mf-phone-tabs" role="tablist" aria-label="Preview">
              {(["chat", "book", "voice"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={`mf-tab ${tab === t ? "mf-tab-on" : ""}`}
                  onClick={() => pick(t)}
                >
                  {t === "chat" ? "💬 Chat" : t === "book" ? "📅 Book" : "🎙️ Voice"}
                </button>
              ))}
            </div>
            <p className="mf-phone-hint">Preview only — create an account to try it live.</p>
          </div>
        </div>
      </section>

      {/* ---------- Moving doctors ---------- */}
      <section className="mf-docs mf-reveal">
        <div className="mf-section-head">
          <h2>Consultants at MCC</h2>
          <p>A growing team across every specialty. <span className="mf-note">(Sample profiles for now.)</span></p>
        </div>
        <div className="mf-marquee">
          <div className="mf-track">
            {[...DOCTORS, ...DOCTORS].map((d, i) => (
              <div className="mf-doccard" key={i}>
                <DoctorAvatar doc={d} size={84} />
                <strong>{d.name}</strong>
                <span>{d.specialty}</span>
                {d.open ? <em className="mf-avail">Available today</em> : <em className="mf-full">Fully booked</em>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Who we serve ---------- */}
      <section className="mf-serve mf-reveal">
        <div className="mf-section-head">
          <h2>Built for everyone at the clinic</h2>
          <p>One system, three points of view.</p>
        </div>
        <div className="mf-rolecards">
          {[
            { icon: "🧑", title: "Patients", body: "Ask Flo anything, find the right doctor, book, get reminders, and see your documents.", tint: "mf-tint-teal" },
            { icon: "🩺", title: "Doctors", body: "Your day at a glance — appointments, consultation notes, follow-ups, and AI-organized summaries.", tint: "mf-tint-violet" },
            { icon: "🏥", title: "Reception", body: "Live queue, QR check-in, bookings, and approvals — the whole floor, under control.", tint: "mf-tint-plum" },
          ].map((r) => (
            <div className={`mf-role ${r.tint}`} key={r.title}>
              <div className="mf-role-ico">{r.icon}</div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mf-how mf-reveal">
        <div className="mf-section-head">
          <h2>How MediFlow works</h2>
          <p>From “I don&apos;t feel well” to a booked visit — in four steps.</p>
        </div>
        <div className="mf-steps">
          {[
            { n: "1", t: "Ask Flo", d: "Tell MediFlow what&apos;s going on, in your own words." },
            { n: "2", t: "Get matched", d: "Flo points you to the right specialty and consultant." },
            { n: "3", t: "Book a slot", d: "Pick a time that works — approvals handled for you." },
            { n: "4", t: "Check in", d: "Arrive and check in with a QR code. No queues." },
          ].map((s) => (
            <div className="mf-step" key={s.n}>
              <span className="mf-step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p dangerouslySetInnerHTML={{ __html: s.d }} />
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Privacy ---------- */}
      <section className="mf-priv mf-reveal">
        <div className="mf-priv-in">
          <div className="mf-priv-copy">
            <span className="mf-kicker">Privacy, by design</span>
            <h2>Your data is protected — and we can prove it.</h2>
            <p>MediFlow was built privacy-first, not privacy-later.</p>
          </div>
          <div className="mf-priv-grid">
            {[
              { i: "🔐", t: "Civil ID encrypted", d: "Stored with pgcrypto + Vault. Access is logged." },
              { i: "🧠", t: "AI sees symptoms only", d: "Never your name, age, gender, or civil ID." },
              { i: "🧾", t: "Full audit trail", d: "Every sensitive action is recorded and alertable." },
              { i: "✅", t: "MFA + least privilege", d: "Row-level security on every table." },
            ].map((c) => (
              <div className="mf-priv-card" key={c.t}>
                <span>{c.i}</span>
                <strong>{c.t}</strong>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="mf-stats mf-reveal">
        {[
          { n: 11, s: "", label: "Consultants" },
          { n: 9, s: "", label: "Specialties" },
          { n: 48, s: "", label: "Services" },
          { n: 1, s: "", label: "Clinic — MCC" },
        ].map((st) => (
          <div className="mf-stat" key={st.label}>
            <strong><CountUp to={st.n} suffix={st.s} /></strong>
            <span>{st.label}</span>
          </div>
        ))}
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mf-final mf-reveal">
        <FloOrb size={70} state="success" />
        <h2>Ready when you are.</h2>
        <p>Create your free account and let Flo take it from here.</p>
        <div className="mf-hero-btns mf-center">
          <Link href="/auth/patient/sign-up" className="mf-btn mf-btn-primary mf-btn-lg">Create account</Link>
          <Link href="/auth/sign-in" className="mf-btn mf-btn-outline mf-btn-lg">Sign in</Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mf-foot">
        <div className="mf-brand">
          <FloOrb size={26} />
          <span className="mf-brand-name">MediFlow<span>AI</span></span>
        </div>
        <p>Serving MCC · Medical Consultants Clinics — عيادات الأطباء الإستشاريين</p>
        <p className="mf-foot-sub">Prototype. Sample data. No diagnosis or triage.</p>
      </footer>
    </div>
  );
}

/* ============================ STYLES ============================ */
const CSS = `
.mf-root{
  --plum:#3b4a87;--plum-h:#44548f;--plum-p:#2e3a6d;--plum-50:#eef0f8;
  --teal:#0a767b;--teal-b:#12a9ae;--teal-50:#e6f4f4;
  --violet:#7458b0;--violet-b:#9179c6;--violet-50:#f0ecf9;
  --coral:#d96a5c;--coral-d:#903228;--coral-50:#fbece9;
  --ink:#1f2540;--ink-2:#5a6285;--bg:#f7f9fb;--surface:#fff;--border:#dfe4ef;--blush:#e9eff7;--lilac:#efebf9;
  --disp:var(--font-display,'Manrope',system-ui,sans-serif);
  --body:var(--font-body,'Inter',system-ui,sans-serif);
  background:var(--bg);color:var(--ink);font-family:var(--body);overflow-x:hidden;
}
.mf-root h1,.mf-root h2,.mf-root h3{font-family:var(--disp);margin:0;line-height:1.1;}
.mf-root p{margin:0;}
.mf-btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;font-weight:700;font-family:var(--body);
  padding:11px 20px;text-decoration:none;border:1.5px solid transparent;cursor:pointer;transition:transform .15s ease,box-shadow .2s ease,background .2s ease;font-size:15px;}
.mf-btn:hover{transform:translateY(-1px);}
.mf-btn-lg{padding:15px 26px;font-size:16px;}
.mf-btn-primary{background:var(--plum);color:#fff;box-shadow:0 8px 20px rgba(59,74,135,.28);}
.mf-btn-primary:hover{background:var(--plum-h);}
.mf-btn-outline{background:#fff;color:var(--plum);border-color:var(--border);}
.mf-btn-outline:hover{border-color:var(--plum);}
.mf-btn-ghost{background:transparent;color:var(--ink);}
.mf-btn-ghost:hover{background:var(--plum-50);}

/* Nav */
.mf-nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(10px);background:rgba(247,249,251,.82);border-bottom:1px solid var(--border);}
.mf-nav-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:16px;padding:12px 22px;}
.mf-brand{display:flex;align-items:center;gap:9px;}
.mf-brand-name{font-family:var(--disp);font-weight:800;font-size:20px;color:var(--ink);letter-spacing:-.02em;}
.mf-brand-name span{color:var(--teal);}
.mf-serving{margin-left:8px;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--plum);
  background:var(--plum-50);padding:6px 12px;border-radius:999px;}
.mf-mcc-dots{display:inline-flex;gap:3px;}
.mf-mcc-dots i{width:6px;height:6px;border-radius:50%;display:block;}
.mf-mcc-dots i:nth-child(1){background:#f2c811;}
.mf-mcc-dots i:nth-child(2){background:#3bb54a;}
.mf-mcc-dots i:nth-child(3){background:#17a2b8;}
.mf-mcc-dots i:nth-child(4){background:#1f5fa8;}
.mf-nav-cta{margin-left:auto;display:flex;gap:8px;align-items:center;}

/* Hero */
.mf-hero{position:relative;overflow:hidden;}
.mf-hero-in{max-width:1180px;margin:0 auto;padding:64px 22px 40px;display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;}
.mf-hero-copy h1{font-size:clamp(34px,4.6vw,56px);font-weight:800;letter-spacing:-.02em;margin:16px 0;}
.mf-grad{background:linear-gradient(90deg,var(--teal-b),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;}
.mf-hero-copy>p{font-size:18px;color:var(--ink-2);max-width:540px;line-height:1.55;}
.mf-pill{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);color:var(--ink);
  padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(31,37,64,.05);}
.mf-pulse{width:8px;height:8px;border-radius:50%;background:var(--teal-b);box-shadow:0 0 0 0 rgba(18,169,174,.6);animation:pulse 2s infinite;}
.mf-hero-btns{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap;}
.mf-center{justify-content:center;}
.mf-trustchips{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px;}
.mf-trustchips span{font-size:12.5px;color:var(--ink-2);background:#fff;border:1px solid var(--border);padding:6px 11px;border-radius:8px;}
.mf-blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.5;z-index:0;}
.mf-blob-a{width:420px;height:420px;background:radial-gradient(circle,var(--teal-50),transparent 70%);top:-120px;right:-60px;animation:float1 14s ease-in-out infinite;}
.mf-blob-b{width:360px;height:360px;background:radial-gradient(circle,var(--lilac),transparent 70%);bottom:-140px;left:-80px;animation:float2 16s ease-in-out infinite;}
.mf-hero-in>*{position:relative;z-index:1;}

/* Phone */
.mf-hero-phone{display:flex;flex-direction:column;align-items:center;}
.mf-phone{width:290px;height:590px;border-radius:44px;background:linear-gradient(160deg,#20264a,#111634);padding:12px;
  box-shadow:0 40px 80px -20px rgba(31,37,64,.45),0 0 0 2px rgba(255,255,255,.06) inset;position:relative;
  transform:perspective(1200px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .2s ease;}
.mf-phone-notch{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:120px;height:24px;background:#0c1030;border-radius:0 0 16px 16px;z-index:3;}
.mf-phone-screen{width:100%;height:100%;border-radius:34px;background:var(--bg);overflow:hidden;position:relative;}
.mf-scr{height:100%;display:flex;flex-direction:column;padding:44px 14px 14px;}
.mf-scr-head{display:flex;align-items:center;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--border);}
.mf-scr-head strong{display:block;font-family:var(--disp);font-size:15px;}
.mf-scr-head span{display:block;font-size:11px;color:var(--ink-2);}
.mf-scr-title{font-family:var(--disp);font-weight:800;font-size:17px;padding:2px 4px 12px;}
.mf-chat{flex:1;display:flex;flex-direction:column;gap:9px;padding:14px 2px;overflow:hidden;}
.mf-b{max-width:82%;padding:9px 13px;border-radius:16px;font-size:12.5px;line-height:1.45;animation:pop .5s both;}
.mf-b-ai{background:#fff;border:1px solid var(--border);border-bottom-left-radius:5px;align-self:flex-start;}
.mf-b-me{background:var(--plum);color:#fff;border-bottom-right-radius:5px;align-self:flex-end;}
.mf-typing{align-self:flex-start;display:flex;gap:4px;padding:8px 12px;background:#fff;border:1px solid var(--border);border-radius:14px;}
.mf-typing span{width:6px;height:6px;border-radius:50%;background:var(--ink-2);animation:blink 1.2s infinite;}
.mf-typing span:nth-child(2){animation-delay:.2s;}
.mf-typing span:nth-child(3){animation-delay:.4s;}
.mf-inputbar{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1.5px solid var(--violet-b);border-radius:14px;padding:11px 13px;font-size:11.5px;color:var(--ink-2);}
.mf-doclist{display:flex;flex-direction:column;gap:8px;}
.mf-docrow{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--border);border-radius:14px;padding:8px 10px;}
.mf-docmeta{flex:1;min-width:0;}
.mf-docmeta strong{display:block;font-size:12px;font-family:var(--disp);}
.mf-docmeta span{font-size:10.5px;color:var(--ink-2);}
.mf-avail{font-size:10px;font-weight:700;color:var(--teal);background:var(--teal-50);padding:3px 8px;border-radius:999px;white-space:nowrap;}
.mf-full{font-size:10px;font-weight:700;color:var(--ink-2);background:#edf0f6;padding:3px 8px;border-radius:999px;white-space:nowrap;}
.mf-slots{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0;}
.mf-slot{font-size:12px;font-weight:600;padding:8px 12px;border-radius:10px;background:#fff;border:1px solid var(--border);}
.mf-slot-sel{background:var(--plum);color:#fff;border-color:var(--plum);}
.mf-scr-cta{margin-top:auto;width:100%;justify-content:center;background:var(--plum);color:#fff;border:none;border-radius:14px;padding:13px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;}
.mf-scr-voice{align-items:center;justify-content:center;gap:18px;text-align:center;}
.mf-wave{display:flex;align-items:center;gap:5px;height:46px;}
.mf-wave span{width:5px;height:14px;border-radius:3px;background:linear-gradient(var(--teal-b),var(--violet));animation:wave 1s ease-in-out infinite;}
.mf-voice-cap{font-family:var(--disp);font-weight:800;font-size:17px;display:flex;gap:6px;align-items:center;justify-content:center;}
.mf-voice-sub{font-size:12px;color:var(--ink-2);max-width:180px;}
.mf-locked{position:relative;cursor:not-allowed;}
.mf-lock{font-size:12px;}
.mf-phone-tabs{display:flex;gap:8px;margin-top:22px;background:#fff;border:1px solid var(--border);padding:5px;border-radius:999px;box-shadow:0 6px 18px rgba(31,37,64,.06);}
.mf-tab{border:none;background:transparent;padding:8px 15px;border-radius:999px;font-weight:600;font-size:13px;color:var(--ink-2);cursor:pointer;transition:all .2s;}
.mf-tab-on{background:var(--plum);color:#fff;}
.mf-phone-hint{font-size:12px;color:var(--ink-2);margin-top:12px;}

/* Section shells */
.mf-section-head{max-width:1180px;margin:0 auto;padding:0 22px 26px;text-align:center;}
.mf-section-head h2{font-size:clamp(26px,3vw,36px);font-weight:800;letter-spacing:-.02em;}
.mf-section-head p{color:var(--ink-2);margin-top:8px;font-size:16px;}
.mf-note,.mf-foot-sub{color:var(--ink-2);opacity:.8;font-size:.9em;}

/* Doctors marquee */
.mf-docs{padding:64px 0;}
.mf-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);}
.mf-track{display:flex;gap:18px;width:max-content;animation:marquee 42s linear infinite;padding:10px 9px;}
.mf-marquee:hover .mf-track{animation-play-state:paused;}
.mf-doccard{flex:0 0 auto;width:172px;background:#fff;border:1px solid var(--border);border-radius:20px;padding:20px 16px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 10px 24px -14px rgba(31,37,64,.3);}
.mf-doccard strong{font-family:var(--disp);font-size:14px;margin-top:6px;}
.mf-doccard>span{font-size:12px;color:var(--ink-2);}
.mf-doccard em{font-style:normal;margin-top:4px;}

/* Roles */
.mf-serve{padding:56px 0;}
.mf-rolecards{max-width:1180px;margin:0 auto;padding:0 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.mf-role{border-radius:22px;padding:28px 24px;border:1px solid var(--border);background:#fff;transition:transform .2s ease,box-shadow .2s ease;}
.mf-role:hover{transform:translateY(-4px);box-shadow:0 18px 40px -18px rgba(31,37,64,.35);}
.mf-role-ico{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;font-size:26px;margin-bottom:14px;}
.mf-tint-teal .mf-role-ico{background:var(--teal-50);}
.mf-tint-violet .mf-role-ico{background:var(--violet-50);}
.mf-tint-plum .mf-role-ico{background:var(--plum-50);}
.mf-role h3{font-size:20px;margin-bottom:8px;}
.mf-role p{color:var(--ink-2);font-size:15px;line-height:1.5;}

/* How */
.mf-how{padding:56px 0;}
.mf-steps{max-width:1180px;margin:0 auto;padding:0 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.mf-step{position:relative;background:#fff;border:1px solid var(--border);border-radius:20px;padding:26px 20px;}
.mf-step-n{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--violet));color:#fff;font-family:var(--disp);font-weight:800;margin-bottom:14px;}
.mf-step h3{font-size:17px;margin-bottom:6px;}
.mf-step p{color:var(--ink-2);font-size:14px;line-height:1.5;}

/* Privacy */
.mf-priv{padding:60px 0;}
.mf-priv-in{max-width:1180px;margin:0 auto;padding:38px 30px;border-radius:28px;background:linear-gradient(135deg,var(--plum),var(--plum-p));color:#fff;
  display:grid;grid-template-columns:.9fr 1.1fr;gap:34px;align-items:center;box-shadow:0 30px 70px -30px rgba(59,74,135,.6);}
.mf-kicker{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--teal-b);}
.mf-priv-copy h2{font-size:clamp(24px,2.6vw,32px);margin:10px 0;color:#fff;}
.mf-priv-copy p{color:rgba(255,255,255,.8);font-size:16px;}
.mf-priv-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.mf-priv-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:18px;}
.mf-priv-card span{font-size:24px;}
.mf-priv-card strong{display:block;margin:8px 0 4px;font-family:var(--disp);font-size:15px;}
.mf-priv-card p{color:rgba(255,255,255,.75);font-size:13px;line-height:1.45;}

/* Stats */
.mf-stats{max-width:1180px;margin:0 auto;padding:20px 22px 60px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;text-align:center;}
.mf-stat{background:#fff;border:1px solid var(--border);border-radius:20px;padding:26px 12px;}
.mf-stat strong{display:block;font-family:var(--disp);font-size:40px;font-weight:800;background:linear-gradient(135deg,var(--teal),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;}
.mf-stat span{color:var(--ink-2);font-size:14px;font-weight:600;}

/* Final */
.mf-final{text-align:center;padding:20px 22px 80px;display:flex;flex-direction:column;align-items:center;gap:14px;}
.mf-final h2{font-size:clamp(28px,3.4vw,42px);font-weight:800;}
.mf-final>p{color:var(--ink-2);font-size:17px;}

/* Footer */
.mf-foot{border-top:1px solid var(--border);padding:34px 22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;}
.mf-foot p{color:var(--ink-2);font-size:14px;}

/* Flo orb */
.mf-orb-wrap{position:relative;display:inline-grid;place-items:center;flex:0 0 auto;}
.mf-orb{position:absolute;inset:12%;border-radius:50%;background:radial-gradient(circle at 32% 30%,var(--teal-b),var(--violet) 75%);box-shadow:0 6px 18px rgba(116,88,176,.4);animation:breathe 4s ease-in-out infinite;}
.mf-orb-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,var(--teal-b),var(--violet),var(--coral),var(--teal-b));opacity:.28;animation:spin 8s linear infinite;}
.mf-orb-dot{position:absolute;width:22%;height:22%;border-radius:50%;background:rgba(255,255,255,.85);top:24%;left:26%;filter:blur(1px);}
.mf-orb-wrap[data-state="listening"] .mf-orb{animation:breathe 1.4s ease-in-out infinite;}
.mf-orb-wrap[data-state="success"] .mf-orb{background:radial-gradient(circle at 32% 30%,#12a9ae,#0a767b 75%);}

/* reveal */
.mf-reveal{opacity:0;transform:translateY(26px);transition:opacity .7s ease,transform .7s ease;}
.mf-reveal.mf-in{opacity:1;transform:none;}

/* keyframes */
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(18,169,174,.6)}70%{box-shadow:0 0 0 10px rgba(18,169,174,0)}100%{box-shadow:0 0 0 0 rgba(18,169,174,0)}}
@keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,26px)}}
@keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(24px,-20px)}}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes blink{0%,60%,100%{opacity:.3}30%{opacity:1}}
@keyframes wave{0%,100%{height:12px}50%{height:40px}}

/* responsive */
@media(max-width:900px){
  .mf-hero-in{grid-template-columns:1fr;text-align:center;}
  .mf-hero-copy{order:2;}
  .mf-hero-btns,.mf-trustchips{justify-content:center;}
  .mf-hero-phone{order:1;}
  .mf-priv-in{grid-template-columns:1fr;}
  .mf-rolecards,.mf-steps,.mf-stats{grid-template-columns:1fr 1fr;}
}
@media(max-width:560px){
  .mf-serving{display:none;}
  .mf-rolecards,.mf-steps,.mf-stats{grid-template-columns:1fr;}
  .mf-priv-grid{grid-template-columns:1fr;}
  .mf-nav-in{flex-wrap:wrap;}
}

/* reduced motion — honor media query AND the app's data attribute */
@media(prefers-reduced-motion:reduce){
  .mf-root *{animation:none!important;transition:none!important;}
  .mf-reveal{opacity:1!important;transform:none!important;}
  .mf-phone{transform:none!important;}
}
:root[data-reduced-motion="true"] .mf-root *{animation:none!important;transition:none!important;}
:root[data-reduced-motion="true"] .mf-reveal{opacity:1!important;transform:none!important;}
:root[data-reduced-motion="true"] .mf-phone{transform:none!important;}
`;
