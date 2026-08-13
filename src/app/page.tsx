"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * MediFlow — public landing page (before sign in / sign up).
 *
 * Direction: calm clinical / editorial. Type-led, near-monochrome with a
 * single plum accent, hairline rules, generous whitespace, custom line
 * icons (no emoji), and a consistent muted avatar set. Everything inside
 * the phone is a preview only — real use unlocks after an account.
 * Motion is quiet and fully disabled under reduced-motion.
 * ------------------------------------------------------------------ */

type AvatarStyle = "hijab" | "short" | "ghutra" | "bun" | "glasses" | "beard";
type Doc = { name: string; specialty: string; skin: string; hair: string; style: AvatarStyle; open: boolean };

const AVA_BG = "#eef1f6";
const DOCTORS: Doc[] = [
  { name: "Dr. Layla Al-Balushi", specialty: "Cardiology", skin: "#e6c3a0", hair: "#0a767b", style: "hijab", open: true },
  { name: "Dr. Omar Al-Hinai", specialty: "Dermatology", skin: "#d3a074", hair: "#2a2f45", style: "beard", open: false },
  { name: "Dr. Aisha Al-Farsi", specialty: "Pediatrics", skin: "#ecc9a6", hair: "#3b4a87", style: "hijab", open: true },
  { name: "Dr. Yusuf Al-Riyami", specialty: "Orthopedics", skin: "#c9926a", hair: "#1f2540", style: "ghutra", open: true },
  { name: "Dr. Mariam Al-Saidi", specialty: "Neurology", skin: "#e6c3a0", hair: "#4a3b2e", style: "bun", open: false },
  { name: "Dr. Khalid Al-Amri", specialty: "ENT", skin: "#d3a074", hair: "#2a2f45", style: "glasses", open: true },
  { name: "Dr. Noor Al-Habsi", specialty: "Dentistry", skin: "#ecc9a6", hair: "#5a6285", style: "hijab", open: true },
  { name: "Dr. Salim Al-Maawali", specialty: "General Medicine", skin: "#c9926a", hair: "#1f2540", style: "short", open: false },
];

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const attr = document.documentElement.getAttribute("data-reduced-motion") === "true";
  return Boolean(mq || attr);
}

/* ---------- Line icons (1.5px stroke, currentColor) ---------- */
function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "chat": return <svg {...p}><path d="M4 5.5h16v10H8.5L4 20z" /></svg>;
    case "calendar": return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>;
    case "shield": return <svg {...p}><path d="M12 3.2l7 2.8v4.6c0 4.4-3 7.4-7 8.9-4-1.5-7-4.5-7-8.9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>;
    case "mic": return <svg {...p}><rect x="9.2" y="3" width="5.6" height="10.5" rx="2.8" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c0-3.6 3.6-5.6 7.5-5.6s7.5 2 7.5 5.6" /></svg>;
    case "steth": return <svg {...p}><path d="M6 3.5v5.2a5 5 0 0 0 10 0V3.5" /><path d="M6 3.5H4.2M16 3.5h1.8M11 20a5 5 0 0 0 5-5v-1.2" /><circle cx="18" cy="12.5" r="2.1" /></svg>;
    case "building": return <svg {...p}><rect x="4.5" y="3.2" width="15" height="17.6" rx="1.2" /><path d="M9 7.6h.02M15 7.6h.02M9 11.6h.02M15 11.6h.02M10 20.8v-4.2h4v4.2" /></svg>;
    case "lock": return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "arrow": return <svg {...p}><path d="M5 12h13M12.5 6l6 6-6 6" /></svg>;
    case "eye": return <svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>;
    case "clip": return <svg {...p}><rect x="6" y="4.5" width="12" height="16" rx="2" /><path d="M9 4.5h6v3H9zM9.5 11h5M9.5 14.5h3.5" /></svg>;
    default: return <svg {...p} />;
  }
}

/* ---------- Consistent, muted doctor avatar ---------- */
function DoctorAvatar({ doc, size = 84 }: { doc: Doc; size?: number }) {
  const { skin, hair, style } = doc;
  const cid = "c" + doc.name.replace(/\W/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs><clipPath id={cid}><circle cx="60" cy="60" r="58" /></clipPath></defs>
      <circle cx="60" cy="60" r="58" fill={AVA_BG} />
      <g clipPath={"url(#" + cid + ")"}>
        <path d="M16 122 C16 98 37 88 60 88 C83 88 104 98 104 122 Z" fill="#ffffff" stroke="#dfe4ef" strokeWidth="1.4" />
        <rect x="53" y="72" width="14" height="18" rx="6" fill={skin} />
        <circle cx="60" cy="52" r="26" fill={skin} />
        {style === "short" && <path d="M34 50 C34 32 47 25 60 25 C73 25 86 32 86 50 C81 42 71 38 60 38 C49 38 39 42 34 50 Z" fill={hair} />}
        {style === "beard" && (<><path d="M35 48 C35 32 47 26 60 26 C73 26 85 32 85 48 C79 41 70 38 60 38 C50 38 41 41 35 48 Z" fill={hair} /><path d="M39 56 C41 72 50 79 60 79 C70 79 79 72 81 56 C74 63 66 65 60 65 C54 65 46 63 39 56 Z" fill={hair} opacity=".92" /></>)}
        {style === "glasses" && (<><path d="M34 50 C34 32 47 25 60 25 C73 25 86 32 86 50 C81 42 71 38 60 38 C49 38 39 42 34 50 Z" fill={hair} /><g fill="none" stroke="#2a2f45" strokeWidth="2.2"><circle cx="50" cy="54" r="7.5" /><circle cx="70" cy="54" r="7.5" /><path d="M57.5 54H62.5" /></g></>)}
        {style === "ghutra" && (<><path d="M28 44 C28 26 42 18 60 18 C78 18 92 26 92 44 L92 58 C86 45 74 41 60 41 C46 41 34 45 28 58 Z" fill="#f4f6fa" stroke="#dfe4ef" strokeWidth="1.2" /><rect x="30" y="31" width="60" height="6" rx="3" fill="#2a2f45" /></>)}
        {style === "bun" && (<><circle cx="60" cy="26" r="8" fill={hair} /><path d="M34 52 C34 32 47 26 60 26 C73 26 86 32 86 52 C81 44 71 40 60 40 C49 40 39 44 34 52 Z" fill={hair} /></>)}
        {style === "hijab" && <path d="M30 54 C30 28 44 18 60 18 C76 18 90 28 90 54 C90 67 85 74 85 74 L80 68 C80 47 72 36 60 36 C48 36 40 47 40 68 L35 74 C35 74 30 67 30 54 Z" fill={hair} />}
        <circle cx="51" cy="53" r="2.3" fill="#2a2f45" />
        <circle cx="69" cy="53" r="2.3" fill="#2a2f45" />
        <path d="M54 62 C57 65 63 65 66 62" fill="none" stroke="#9c6b5e" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke="rgba(31,37,64,.07)" strokeWidth="2" />
    </svg>
  );
}

/* ---------- Flo mark (calm, single-accent) ---------- */
function Flo({ size = 30 }: { size?: number }) {
  return (
    <span className="mf-flo" style={{ width: size, height: size }} aria-hidden="true">
      <span className="mf-flo-ring" />
      <span className="mf-flo-core" />
    </span>
  );
}

/* ---------- Phone preview screens ---------- */
function ScreenChat() {
  return (
    <div className="mf-scr">
      <div className="mf-scr-top"><Flo size={22} /><span>Ask MediFlow</span></div>
      <div className="mf-chat">
        <p className="mf-msg mf-msg-ai">Hello — how can I help you today?</p>
        <p className="mf-msg mf-msg-me">I&apos;ve had a headache for two weeks.</p>
        <p className="mf-msg mf-msg-ai">That&apos;s something a Neurology consultant can review. Shall I find you a time?</p>
        <span className="mf-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="mf-field"><span>Type a message</span><Icon name="lock" size={15} /></div>
    </div>
  );
}
function ScreenBook() {
  return (
    <div className="mf-scr">
      <div className="mf-scr-h">Book a visit</div>
      {DOCTORS.slice(0, 3).map((d) => (
        <div className="mf-row" key={d.name}>
          <DoctorAvatar doc={d} size={34} />
          <div className="mf-row-t"><strong>{d.name}</strong><span>{d.specialty}</span></div>
          <em className={d.open ? "mf-tag mf-tag-on" : "mf-tag"}>{d.open ? "Today" : "Full"}</em>
        </div>
      ))}
      <div className="mf-slotrow">{["09:00", "10:30", "13:15", "16:00"].map((s, i) => <span key={s} className={i === 1 ? "mf-slot mf-slot-on" : "mf-slot"}>{s}</span>)}</div>
      <button className="mf-scr-btn">Confirm <Icon name="lock" size={14} /></button>
    </div>
  );
}
function ScreenVoice() {
  return (
    <div className="mf-scr mf-scr-c">
      <Flo size={72} />
      <div className="mf-wave" aria-hidden="true">{Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: i * 0.09 + "s" }} />)}</div>
      <p className="mf-scr-lead">Voice intake</p>
      <p className="mf-scr-sub">Speak your symptoms — unlocks after sign in.</p>
    </div>
  );
}

/* ============================ PAGE ============================ */
export default function LandingPage() {
  const [tab, setTab] = useState<"chat" | "book" | "voice">("chat");
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (picked || reducedMotion()) return;
    const order: Array<"chat" | "book" | "voice"> = ["chat", "book", "voice"];
    const id = setInterval(() => setTab((t) => order[(order.indexOf(t) + 1) % order.length]), 5200);
    return () => clearInterval(id);
  }, [picked]);

  useEffect(() => {
    if (reducedMotion()) {
      document.querySelectorAll(".mf-rise").forEach((el) => el.classList.add("mf-on"));
      return;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("mf-on"); io.unobserve(e.target); } }), { threshold: 0.14 });
    document.querySelectorAll(".mf-rise").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="mf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Nav */}
      <header className="mf-nav">
        <div className="mf-wrap mf-nav-in">
          <Link href="/" className="mf-logo"><Flo size={22} /> MediFlow</Link>
          <nav className="mf-nav-r">
            <Link href="/auth/sign-in" className="mf-link">Sign in</Link>
            <Link href="/auth/patient/sign-up" className="mf-btn">Create account</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mf-hero">
        <div className="mf-wrap mf-hero-in">
          <div className="mf-hero-l mf-rise">
            <p className="mf-kick">MediFlow — for patients at MCC</p>
            <h1>Every visit to the clinic, quietly guided.</h1>
            <p className="mf-lead">
              MediFlow helps you find the right consultant, book a time, and check in — and
              answers your questions along the way. No phone queues, no guesswork.
            </p>
            <div className="mf-cta">
              <Link href="/auth/patient/sign-up" className="mf-btn mf-btn-lg">Create account</Link>
              <Link href="/auth/sign-in" className="mf-textlink">Sign in <Icon name="arrow" size={17} /></Link>
            </div>
            <p className="mf-serving">
              <span className="mf-dotset" aria-hidden="true"><i /><i /><i /><i /></span>
              Now serving MCC — Medical Consultants Clinics
            </p>
          </div>

          <div className="mf-hero-r mf-rise">
            <div className="mf-phone">
              <span className="mf-phone-speaker" />
              <div className="mf-phone-screen">
                {tab === "chat" && <ScreenChat />}
                {tab === "book" && <ScreenBook />}
                {tab === "voice" && <ScreenVoice />}
              </div>
            </div>
            <div className="mf-tabs" role="tablist" aria-label="Preview">
              {(["chat", "book", "voice"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "mf-tab mf-tab-on" : "mf-tab"} onClick={() => { setPicked(true); setTab(t); }}>
                  {t === "chat" ? "Chat" : t === "book" ? "Book" : "Voice"}
                </button>
              ))}
            </div>
            <p className="mf-preview-note">Preview only — create an account to try it live.</p>
          </div>
        </div>
      </section>

      {/* Doctors */}
      <section className="mf-sec">
        <div className="mf-wrap">
          <div className="mf-sec-head mf-rise">
            <span className="mf-num">01</span>
            <div>
              <h2>A full bench of consultants.</h2>
              <p>Specialists across every department at MCC. <span className="mf-muted">Sample profiles shown for now.</span></p>
            </div>
          </div>
        </div>
        <div className="mf-marquee mf-rise">
          <div className="mf-track">
            {[...DOCTORS, ...DOCTORS].map((d, i) => (
              <div className="mf-doc" key={i}>
                <DoctorAvatar doc={d} size={72} />
                <div><strong>{d.name}</strong><span>{d.specialty}</span></div>
                <em className={d.open ? "mf-dot-on" : "mf-dot-off"}>{d.open ? "Available" : "Booked"}</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mf-sec mf-hair-t">
        <div className="mf-wrap">
          <div className="mf-sec-head mf-rise"><span className="mf-num">02</span><div><h2>Built for everyone at the clinic.</h2><p>One system, three points of view.</p></div></div>
          <div className="mf-cols">
            {[
              { icon: "user", t: "Patients", d: "Ask MediFlow anything, find the right consultant, book, and keep your documents in one place." },
              { icon: "steth", t: "Doctors", d: "Your day at a glance — appointments, consultation notes, follow-ups, and organized summaries." },
              { icon: "building", t: "Reception", d: "Live queue, QR check-in, bookings, and approvals — the whole floor, under control." },
            ].map((c) => (
              <div className="mf-col mf-rise" key={c.t}>
                <span className="mf-col-ic"><Icon name={c.icon} size={24} /></span>
                <h3>{c.t}</h3>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mf-sec mf-hair-t">
        <div className="mf-wrap">
          <div className="mf-sec-head mf-rise"><span className="mf-num">03</span><div><h2>How it works.</h2><p>From first question to checked-in — four steps.</p></div></div>
          <div className="mf-steps">
            {[
              { n: "01", t: "Ask", d: "Tell MediFlow what is going on, in your own words." },
              { n: "02", t: "Match", d: "It points you to the right specialty and consultant." },
              { n: "03", t: "Book", d: "Pick a time that works. Approvals are handled for you." },
              { n: "04", t: "Check in", d: "Arrive and check in with a QR code. No queues." },
            ].map((s) => (
              <div className="mf-step mf-rise" key={s.n}>
                <span className="mf-step-n">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy — dark band */}
      <section className="mf-priv mf-rise">
        <div className="mf-wrap">
          <span className="mf-kick mf-kick-t">Privacy, by design</span>
          <h2>Security you can audit — not just trust.</h2>
          <div className="mf-priv-grid">
            {[
              { icon: "lock", t: "Civil ID encrypted", d: "Stored with pgcrypto and Vault. Every access is logged." },
              { icon: "eye", t: "The AI sees symptoms only", d: "Never your name, age, gender, or civil ID." },
              { icon: "clip", t: "A full audit trail", d: "Every sensitive action is recorded and can raise an alert." },
              { icon: "shield", t: "MFA and least privilege", d: "Row-level security enforced on every table." },
            ].map((c) => (
              <div className="mf-priv-item" key={c.t}>
                <Icon name={c.icon} size={22} />
                <div><strong>{c.t}</strong><p>{c.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mf-sec mf-hair-t">
        <div className="mf-wrap mf-stats mf-rise">
          {[
            { n: "11", l: "Consultants" },
            { n: "9", l: "Specialties" },
            { n: "48", l: "Services" },
            { n: "MCC", l: "One clinic, for now" },
          ].map((s) => (
            <div className="mf-stat" key={s.l}><strong>{s.n}</strong><span>{s.l}</span></div>
          ))}
        </div>
      </section>

      {/* Final */}
      <section className="mf-final mf-hair-t mf-rise">
        <div className="mf-wrap">
          <h2>Ready when you are.</h2>
          <p>Create your free account and let MediFlow take it from here.</p>
          <div className="mf-cta mf-cta-c">
            <Link href="/auth/patient/sign-up" className="mf-btn mf-btn-lg">Create account</Link>
            <Link href="/auth/sign-in" className="mf-textlink">Sign in <Icon name="arrow" size={17} /></Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mf-foot mf-hair-t">
        <div className="mf-wrap mf-foot-in">
          <Link href="/" className="mf-logo"><Flo size={20} /> MediFlow</Link>
          <p>Serving MCC — Medical Consultants Clinics · عيادات الأطباء الإستشاريين</p>
          <p className="mf-muted mf-small">Prototype · sample data · no diagnosis or triage</p>
        </div>
      </footer>
    </div>
  );
}

/* ============================ STYLES ============================ */
const CSS = `
.mf{
  --ink:#1f2540;--ink-2:#5a6285;--ink-3:#8b93ac;
  --bg:#fbfcfd;--surface:#fff;--line:#e7eaf1;--line-2:#dfe4ef;
  --accent:#3b4a87;--accent-d:#2e3a6d;--teal:#0a767b;
  --disp:var(--font-display,'Manrope',system-ui,sans-serif);
  --body:var(--font-body,'Inter',system-ui,sans-serif);
  background:var(--bg);color:var(--ink);font-family:var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.mf h1,.mf h2,.mf h3{font-family:var(--disp);margin:0;letter-spacing:-.025em;color:var(--ink);}
.mf p{margin:0;}
.mf-wrap{max-width:1120px;margin:0 auto;padding:0 32px;}
.mf-hair-t{border-top:1px solid var(--line);}
.mf-muted{color:var(--ink-3);}
.mf-small{font-size:13px;}

/* buttons + links */
.mf-btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:#fff;font-weight:600;font-size:14px;
  padding:11px 18px;border-radius:10px;text-decoration:none;border:none;cursor:pointer;transition:background .18s ease;font-family:var(--body);}
.mf-btn:hover{background:#12172e;}
.mf-btn-lg{padding:14px 24px;font-size:15px;}
.mf-link{color:var(--ink-2);text-decoration:none;font-size:14px;font-weight:500;transition:color .15s;}
.mf-link:hover{color:var(--ink);}
.mf-textlink{display:inline-flex;align-items:center;gap:6px;color:var(--accent);text-decoration:none;font-weight:600;font-size:15px;}
.mf-textlink:hover{gap:9px;}
.mf-textlink svg{transition:transform .18s ease;}
.mf-textlink:hover svg{transform:translateX(3px);}

/* nav */
.mf-nav{position:sticky;top:0;z-index:40;background:rgba(251,252,253,.86);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);}
.mf-nav-in{display:flex;align-items:center;justify-content:space-between;height:64px;}
.mf-logo{display:inline-flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:800;font-size:19px;color:var(--ink);text-decoration:none;letter-spacing:-.02em;}
.mf-nav-r{display:flex;align-items:center;gap:22px;}

/* Flo mark */
.mf-flo{position:relative;display:inline-grid;place-items:center;flex:0 0 auto;}
.mf-flo-ring{position:absolute;inset:0;border-radius:50%;border:1.5px solid var(--accent);opacity:.35;}
.mf-flo-core{position:absolute;inset:26%;border-radius:50%;background:var(--accent);}

/* hero */
.mf-hero{padding:88px 0 80px;}
.mf-hero-in{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;}
.mf-kick{font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);}
.mf-hero-l h1{font-size:clamp(38px,4.7vw,60px);line-height:1.04;font-weight:800;margin:20px 0;max-width:15ch;}
.mf-lead{font-size:18px;line-height:1.6;color:var(--ink-2);max-width:46ch;}
.mf-cta{display:flex;align-items:center;gap:22px;margin-top:32px;flex-wrap:wrap;}
.mf-cta-c{justify-content:center;}
.mf-serving{display:flex;align-items:center;gap:10px;margin-top:34px;font-size:13.5px;color:var(--ink-3);}
.mf-dotset{display:inline-flex;gap:3px;}
.mf-dotset i{width:6px;height:6px;border-radius:50%;}
.mf-dotset i:nth-child(1){background:#f2c811;}
.mf-dotset i:nth-child(2){background:#3bb54a;}
.mf-dotset i:nth-child(3){background:#17a2b8;}
.mf-dotset i:nth-child(4){background:#1f5fa8;}

/* phone */
.mf-hero-r{display:flex;flex-direction:column;align-items:center;}
.mf-phone{width:272px;height:552px;background:#fff;border:1px solid var(--line-2);border-radius:40px;padding:12px;position:relative;
  box-shadow:0 30px 60px -34px rgba(31,37,64,.35);}
.mf-phone-speaker{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:46px;height:5px;border-radius:3px;background:#e7eaf1;}
.mf-phone-screen{width:100%;height:100%;background:var(--bg);border-radius:30px;overflow:hidden;}
.mf-scr{height:100%;display:flex;flex-direction:column;padding:40px 15px 15px;}
.mf-scr-top{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:700;font-size:14px;padding-bottom:13px;border-bottom:1px solid var(--line);}
.mf-scr-h{font-family:var(--disp);font-weight:800;font-size:16px;padding:2px 2px 14px;}
.mf-chat{flex:1;display:flex;flex-direction:column;gap:8px;padding:14px 0;}
.mf-msg{max-width:85%;padding:9px 12px;border-radius:13px;font-size:12.5px;line-height:1.45;}
.mf-msg-ai{background:#fff;border:1px solid var(--line);color:var(--ink);align-self:flex-start;border-bottom-left-radius:4px;}
.mf-msg-me{background:var(--ink);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
.mf-dots{align-self:flex-start;display:flex;gap:4px;padding:9px 12px;background:#fff;border:1px solid var(--line);border-radius:12px;}
.mf-dots i{width:5px;height:5px;border-radius:50%;background:var(--ink-3);animation:mfblink 1.2s infinite;}
.mf-dots i:nth-child(2){animation-delay:.2s;}.mf-dots i:nth-child(3){animation-delay:.4s;}
.mf-field{margin-top:auto;display:flex;align-items:center;justify-content:space-between;color:var(--ink-3);background:#fff;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;font-size:12px;}
.mf-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);}
.mf-row-t{flex:1;min-width:0;}
.mf-row-t strong{display:block;font-size:12px;font-family:var(--disp);}
.mf-row-t span{font-size:10.5px;color:var(--ink-3);}
.mf-tag{font-size:10px;font-weight:600;color:var(--ink-3);white-space:nowrap;}
.mf-tag-on{color:var(--teal);}
.mf-slotrow{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0;}
.mf-slot{font-size:12px;padding:8px 12px;border:1px solid var(--line-2);border-radius:9px;color:var(--ink-2);}
.mf-slot-on{background:var(--ink);color:#fff;border-color:var(--ink);}
.mf-scr-btn{margin-top:auto;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--ink);color:#fff;border:none;border-radius:11px;padding:12px;font-weight:600;font-size:13px;font-family:var(--body);}
.mf-scr-c{align-items:center;justify-content:center;gap:18px;text-align:center;}
.mf-wave{display:flex;align-items:center;gap:5px;height:40px;color:var(--accent);}
.mf-wave span{width:4px;height:12px;border-radius:2px;background:currentColor;animation:mfwave 1s ease-in-out infinite;}
.mf-scr-lead{font-family:var(--disp);font-weight:800;font-size:16px;}
.mf-scr-sub{font-size:12px;color:var(--ink-3);max-width:170px;}
.mf-tabs{display:flex;gap:8px;margin-top:26px;}
.mf-tab{border:1px solid var(--line-2);background:#fff;color:var(--ink-2);padding:8px 18px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--body);transition:all .16s;}
.mf-tab-on{background:var(--ink);color:#fff;border-color:var(--ink);}
.mf-preview-note{margin-top:14px;font-size:12.5px;color:var(--ink-3);}

/* sections */
.mf-sec{padding:80px 0;}
.mf-sec-head{display:flex;gap:22px;align-items:flex-start;margin-bottom:44px;}
.mf-num{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--accent);padding-top:8px;letter-spacing:.05em;}
.mf-sec-head h2{font-size:clamp(26px,3vw,34px);font-weight:800;}
.mf-sec-head p{margin-top:8px;color:var(--ink-2);font-size:16px;}

/* doctors marquee */
.mf-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);}
.mf-track{display:flex;gap:14px;width:max-content;animation:mfmarq 52s linear infinite;padding:4px 32px;}
.mf-marquee:hover .mf-track{animation-play-state:paused;}
.mf-doc{flex:0 0 auto;display:flex;align-items:center;gap:13px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px 14px 14px;min-width:250px;}
.mf-doc strong{display:block;font-family:var(--disp);font-size:14px;}
.mf-doc span{font-size:12.5px;color:var(--ink-3);}
.mf-doc em{font-style:normal;font-size:11px;font-weight:600;margin-left:auto;padding-left:12px;}
.mf-dot-on{color:var(--teal);}
.mf-dot-off{color:var(--ink-3);}

/* who — columns */
.mf-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--line);}
.mf-col{padding:34px 30px 34px 0;border-right:1px solid var(--line);}
.mf-col:last-child{border-right:none;padding-right:0;}
.mf-col:not(:first-child){padding-left:30px;}
.mf-col-ic{display:inline-grid;place-items:center;width:44px;height:44px;border:1px solid var(--line-2);border-radius:11px;color:var(--accent);margin-bottom:18px;}
.mf-col h3{font-size:19px;font-weight:700;margin-bottom:9px;}
.mf-col p{color:var(--ink-2);font-size:15px;line-height:1.55;}

/* steps */
.mf-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--line);}
.mf-step{padding:30px 26px 0 0;border-right:1px solid var(--line);}
.mf-step:last-child{border-right:none;}
.mf-step:not(:first-child){padding-left:26px;}
.mf-step-n{font-family:var(--disp);font-weight:800;font-size:15px;color:var(--ink-3);}
.mf-step h3{font-size:18px;font-weight:700;margin:12px 0 8px;}
.mf-step p{color:var(--ink-2);font-size:14.5px;line-height:1.55;}

/* privacy dark band */
.mf-priv{background:var(--ink);color:#fff;padding:84px 0;}
.mf-priv h2{color:#fff;font-size:clamp(26px,3vw,36px);font-weight:800;margin:14px 0 40px;max-width:18ch;}
.mf-kick-t{color:#8ea0d8;}
.mf-priv-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid rgba(255,255,255,.14);}
.mf-priv-item{display:flex;gap:16px;padding:26px 34px 26px 0;border-bottom:1px solid rgba(255,255,255,.14);color:#9aa4c4;}
.mf-priv-item:nth-child(odd){border-right:1px solid rgba(255,255,255,.14);}
.mf-priv-item:nth-child(even){padding-left:34px;}
.mf-priv-item svg{flex:0 0 auto;margin-top:2px;color:#8ea0d8;}
.mf-priv-item strong{display:block;color:#fff;font-family:var(--disp);font-size:16px;margin-bottom:5px;}
.mf-priv-item p{font-size:14px;line-height:1.5;color:#9aa4c4;}

/* stats */
.mf-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--line);}
.mf-stat{padding:34px 24px 0 0;border-right:1px solid var(--line);}
.mf-stat:last-child{border-right:none;}
.mf-stat:not(:first-child){padding-left:24px;}
.mf-stat strong{display:block;font-family:var(--disp);font-weight:800;font-size:42px;letter-spacing:-.03em;}
.mf-stat span{color:var(--ink-3);font-size:14px;}

/* final */
.mf-final{padding:88px 0;text-align:center;}
.mf-final h2{font-size:clamp(30px,3.6vw,44px);font-weight:800;}
.mf-final p{color:var(--ink-2);font-size:17px;margin:14px 0 30px;}

/* footer */
.mf-foot{padding:40px 0;}
.mf-foot-in{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;}
.mf-foot p{color:var(--ink-2);font-size:14px;}

/* motion */
.mf-rise{opacity:0;transform:translateY(20px);transition:opacity .7s ease,transform .7s ease;}
.mf-rise.mf-on{opacity:1;transform:none;}
@keyframes mfmarq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes mfblink{0%,60%,100%{opacity:.3}30%{opacity:1}}
@keyframes mfwave{0%,100%{height:10px}50%{height:34px}}

@media(max-width:900px){
  .mf-hero-in{grid-template-columns:1fr;gap:48px;}
  .mf-hero-r{order:-1;}
  .mf-cols,.mf-steps,.mf-stats,.mf-priv-grid{grid-template-columns:1fr 1fr;}
  .mf-col,.mf-step,.mf-stat{border-right:none;padding-right:24px;}
}
@media(max-width:600px){
  .mf-wrap{padding:0 22px;}
  .mf-cols,.mf-steps,.mf-stats,.mf-priv-grid{grid-template-columns:1fr;}
  .mf-col,.mf-step,.mf-stat{padding-left:0!important;padding-right:0;border-bottom:1px solid var(--line);padding-bottom:26px;}
  .mf-priv-item{padding-left:0!important;padding-right:0;border-right:none!important;}
  .mf-sec-head{flex-direction:column;gap:8px;}
}
@media(prefers-reduced-motion:reduce){
  .mf *{animation:none!important;transition:none!important;}
  .mf-rise{opacity:1!important;transform:none!important;}
}
:root[data-reduced-motion="true"] .mf *{animation:none!important;transition:none!important;}
:root[data-reduced-motion="true"] .mf-rise{opacity:1!important;transform:none!important;}
`;
