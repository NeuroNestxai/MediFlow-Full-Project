"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import styles from "@/components/auth/authForm.module.css";

const MIN_PASSWORD_LENGTH = 8;

type Phase = "checking" | "ready" | "expired" | "done";

export function ResetPasswordView() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("checking");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Establish the recovery session from the reset link (PKCE code flow),
  // tolerating the browser client's automatic URL-session detection.
  useEffect(() => {
    let active = true;
    async function init() {
      const supabase = createClient();
      const existing = await supabase.auth.getSession();
      if (existing.data.session) {
        if (active) setPhase("ready");
        return;
      }
      const code = searchParams.get("code");
      if (!code) {
        if (active) setPhase("expired");
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (active) setPhase("ready");
        return;
      }
      // The code may have already been consumed by auto-detection — re-check.
      const recheck = await supabase.auth.getSession();
      if (active) setPhase(recheck.data.session ? "ready" : "expired");
    }
    init();
    return () => {
      active = false;
    };
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextErrors: typeof errors = {};
    if (!password) nextErrors.password = "Choose a new password.";
    else if (password.length < MIN_PASSWORD_LENGTH)
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords do not match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(
          error.code === "weak_password"
            ? "Please choose a stronger password (at least 8 characters)."
            : "We couldn't update your password. Please try again.",
        );
        return;
      }
      setPhase("done");
    } catch {
      setFormError("We couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      {phase === "checking" && (
        <>
          <h1 className={styles.title}>Checking your link…</h1>
          <p className={styles.subtitle}>One moment while we verify your reset link.</p>
        </>
      )}

      {phase === "expired" && (
        <>
          <h1 className={styles.title}>This link has expired</h1>
          <p className={styles.subtitle}>
            Password reset links can only be used once and expire after a short time. Request a new
            one to continue.
          </p>
          <div className={styles.actions}>
            <Button href="/auth/forgot-password" variant="primary" fullWidth>
              Request a New Link
            </Button>
          </div>
        </>
      )}

      {phase === "ready" && (
        <>
          <h1 className={styles.title}>Choose a new password</h1>
          <p className={styles.subtitle}>Enter and confirm your new password below.</p>

          {formError ? (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              {formError}
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <PasswordField
              id="password"
              label="New password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              disabled={submitting}
            />

            <PasswordField
              id="confirmPassword"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              error={errors.confirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              disabled={submitting}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={submitting}
              aria-busy={submitting}
              className={styles.submit}
            >
              {submitting ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </>
      )}

      {phase === "done" && (
        <>
          <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
            Your password has been updated.
          </div>
          <div className={styles.actions}>
            <Button href="/auth/post-login" variant="primary" fullWidth>
              Continue to Dashboard
            </Button>
          </div>
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
