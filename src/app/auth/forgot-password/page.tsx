"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { createClient } from "@/lib/supabase/client";
import styles from "@/components/auth/authForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (error && EMAIL_RE.test(value.trim())) setError(undefined);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email to continue.");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);

    setSubmitting(true);
    setAnnouncement("Sending your reset link…");
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (resetError) {
        // Only surface a safe, generic message (e.g. rate limiting). Never the
        // raw error — and never reveal whether the email exists.
        const message = "We couldn't send a reset link right now. Please try again shortly.";
        setFormError(message);
        setAnnouncement(message);
        return;
      }
      setSent(true);
      setAnnouncement("If an account exists for that email, a reset link is on its way.");
    } catch {
      const message = "We couldn't reach the server. Please try again.";
      setFormError(message);
      setAnnouncement(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>

      <h1 className={styles.title}>Forgot your password?</h1>
      <p className={styles.subtitle}>
        Enter your email and we&rsquo;ll send you a link to reset it.
      </p>

      {sent ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
          If an account exists for that email, a password reset link has been sent. Check your inbox
          and follow the link to choose a new password.
        </div>
      ) : (
        <>
          {formError ? (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              {formError}
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <FormField label="Email" htmlFor="email" error={error} required>
              {({ describedBy }) => (
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  autoComplete="email"
                  disabled={submitting}
                />
              )}
            </FormField>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={submitting}
              aria-busy={submitting}
              className={styles.submit}
            >
              {submitting ? "Sending…" : "Send Reset Link"}
            </Button>
          </form>
        </>
      )}

      <div className={`${styles.links} ${styles.linkCenter}`}>
        <Link href="/auth/sign-in" className={styles.link}>
          Back to Sign In
        </Link>
      </div>
    </AuthShell>
  );
}
