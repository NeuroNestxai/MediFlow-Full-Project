"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { safeAuthMessage } from "@/lib/supabase/auth-messages";
import { OtpInput } from "./OtpInput";
import authStyles from "@/components/auth/authForm.module.css";
import styles from "./VerifyForm.module.css";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Six-digit email confirmation, in place of a clickable link.
 *
 * Why: Supabase's link-based confirmation only works back on the exact
 * device/browser the sign-up form was filled out on (it's a PKCE flow with
 * device-local state) -- someone who signs up on a laptop and opens their
 * email on their phone gets a hard failure every time, which is a completely
 * normal, common pattern, not an edge case. A 6-digit code has no such
 * restriction: it works from anywhere, since the code itself is all that's
 * needed.
 */
export function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  // Starts counting down immediately on page load, not just after an
  // explicit resend click -- a code was already sent to get here, so the
  // cooldown should visibly apply from the start rather than let someone
  // spam-resend on the very first render.
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function verify(fullCode: string) {
    setFormError(null);
    setCodeError(null);
    setVerifying(true);
    setAnnouncement("Verifying your code…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: "signup",
      });

      if (error) {
        const message = safeAuthMessage(error, "That code didn't work. Please try again.");
        setFormError(message);
        setAnnouncement(message);
        return;
      }

      setAnnouncement("Verified. Taking you to your dashboard…");
      router.replace("/auth/post-login");
      router.refresh();
    } catch {
      const message = "We couldn't reach the verification service. Please try again.";
      setFormError(message);
      setAnnouncement(message);
    } finally {
      setVerifying(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setCodeError("Enter the 6-digit code from your email.");
      setAnnouncement("Enter the 6-digit code from your email.");
      return;
    }
    await verify(code);
  }

  async function onResend() {
    if (resendCooldown > 0 || resending) return;
    setFormError(null);
    setResending(true);
    setAnnouncement("Sending a new code…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) {
        const message = safeAuthMessage(error, "We couldn't send a new code. Please try again.");
        setFormError(message);
        setAnnouncement(message);
        return;
      }
      setCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setAnnouncement("A new code is on its way.");
    } catch {
      const message = "We couldn't reach the sign-up service. Please try again.";
      setFormError(message);
      setAnnouncement(message);
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell>
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>

      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroBadge} aria-hidden="true">
          <EnvelopeMark />
        </div>
      </div>

      <h1 className={`${authStyles.title} ${styles.centerText}`}>Enter your code</h1>
      <p className={`${authStyles.subtitle} ${styles.centerText}`}>
        We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish setting up
        your account.
      </p>

      {formError ? (
        <div className={`${authStyles.banner} ${authStyles.bannerError}`} role="alert">
          {formError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className={authStyles.form}>
        <OtpInput
          length={CODE_LENGTH}
          value={code}
          onChange={setCode}
          onComplete={(full) => void verify(full)}
          disabled={verifying}
          invalid={Boolean(codeError)}
          aria-describedby={codeError ? "code-error" : undefined}
        />
        {codeError ? (
          <p id="code-error" className={styles.fieldError} role="alert">
            {codeError}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={verifying || code.length !== CODE_LENGTH}
          aria-busy={verifying}
          className={authStyles.submit}
        >
          {verifying ? "Verifying…" : "Verify and Continue"}
        </Button>
      </form>

      <div className={`${authStyles.links} ${authStyles.linkCenter}`}>
        <span className={styles.resendPrompt}>Didn&apos;t get a code? </span>
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={resendCooldown > 0 || resending}
          className={`${authStyles.link} ${authStyles.linkButton}`}
        >
          {resending
            ? "Sending…"
            : resendCooldown > 0
              ? `Resend code (${resendCooldown}s)`
              : "Resend code"}
        </button>
      </div>
    </AuthShell>
  );
}

/**
 * A one-off mark built for this screen specifically -- an envelope with a
 * confirmation check, in the same brand gradient as the rest of the app,
 * rather than a generic stock illustration. Sits inside a glass badge with
 * a soft glow behind it (see .heroBadge / .heroGlow), echoing the same
 * treatment already used behind the logo on this shell.
 */
function EnvelopeMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="verify-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12A9AE" />
          <stop offset="55%" stopColor="#4A6FB0" />
          <stop offset="100%" stopColor="#9179C6" />
        </linearGradient>
      </defs>
      <rect x="3" y="8" width="34" height="24" rx="5" stroke="url(#verify-mark)" strokeWidth="2" />
      <path
        d="M5 11 L20 23 L35 11"
        stroke="url(#verify-mark)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="30" cy="28" r="9" fill="white" />
      <circle cx="30" cy="28" r="9" stroke="url(#verify-mark)" strokeWidth="2" />
      <path
        d="M26.2 28.2 L28.8 30.8 L34 25.4"
        stroke="url(#verify-mark)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
