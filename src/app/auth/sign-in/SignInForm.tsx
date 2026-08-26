"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { createClient } from "@/lib/supabase/client";
import { safeAuthMessage } from "@/lib/supabase/auth-messages";
import styles from "@/components/auth/authForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONFIRMATION_ERROR =
  "We couldn't confirm your email. The link may have expired — sign in below, or request a new confirmation email.";

/**
 * Shared sign-in form for ALL roles. There is no role selector: after
 * signInWithPassword succeeds, the browser is sent to /auth/post-login, which
 * reads the role server-side from public.user_roles and redirects to the
 * correct dashboard. The client never determines authorization.
 */
export function SignInForm({
  confirmationError = false,
  next,
}: {
  confirmationError?: boolean;
  /** Where to return after signing in -- already validated server-side by the page. */
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(
    confirmationError ? CONFIRMATION_ERROR : null,
  );
  const [announcement, setAnnouncement] = useState<string | null>(
    confirmationError ? CONFIRMATION_ERROR : null,
  );
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: typeof errors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      nextErrors.email = "Enter your email to continue.";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Enter your password to continue.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (errors.email && EMAIL_RE.test(value.trim())) {
      setErrors((prev) => ({ ...prev, email: undefined }));
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (errors.password && value) {
      setErrors((prev) => ({ ...prev, password: undefined }));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) {
      setAnnouncement("There are errors in the form. Please review the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setAnnouncement("Signing you in…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        // Generic, non-enumerating message for any credential failure.
        const message = safeAuthMessage(error, "The email or password you entered is incorrect.");
        setFormError(message);
        setAnnouncement(message);
        return;
      }

      // Role-based redirect is resolved entirely server-side.
      setAnnouncement("Signed in. Taking you to your dashboard…");
      router.replace(next ? `/auth/post-login?next=${encodeURIComponent(next)}` : "/auth/post-login");
      router.refresh();
    } catch {
      const message = "We couldn't reach the sign-in service. Please try again.";
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

      <AuthTabs active="sign-in" />

      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>
        Patients, doctors, and reception staff sign in using their assigned account.
      </p>

      {formError ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {formError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className={styles.form}>
        <FormField label="Email" htmlFor="email" error={errors.email} required>
          {({ describedBy }) => (
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              invalid={Boolean(errors.email)}
              aria-describedby={describedBy}
              autoComplete="username"
              disabled={submitting}
            />
          )}
        </FormField>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={handlePasswordChange}
          error={errors.password}
          autoComplete="current-password"
          placeholder="Your password"
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
          {submitting ? "Signing in…" : "Sign In"}
        </Button>
      </form>

      <div className={styles.links}>
        <Link href="/auth/forgot-password" className={styles.link}>
          Forgot Password?
        </Link>
        <Link href="/auth/patient/sign-up" className={styles.link}>
          Create Patient Account
        </Link>
      </div>
    </AuthShell>
  );
}
