"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { createClient } from "@/lib/supabase/client";
import { safeAuthMessage } from "@/lib/supabase/auth-messages";
import styles from "@/components/auth/authForm.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function SignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    if (!fullName.trim()) {
      nextErrors.fullName = "Enter your full name.";
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      nextErrors.email = "Enter your email to continue.";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Choose a password.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) {
      setAnnouncement("There are errors in the form. Please review the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setAnnouncement("Creating your account…");
    try {
      const supabase = createClient();
      const trimmedEmail = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (error) {
        const message = safeAuthMessage(
          error,
          "We couldn't create your account. Please try again.",
        );
        setFormError(message);
        setAnnouncement(message);
        return;
      }

      if (data.session) {
        setAnnouncement("Account created. Taking you to your dashboard…");
        router.replace("/auth/post-login");
        router.refresh();
        return;
      }

      // Supabase does not return an error for a duplicate sign-up (to avoid
      // leaking which emails are already registered). Instead it returns a
      // user object with an empty "identities" array. That is the only
      // signal we get, so we check for it here and show an inline error
      // immediately instead of pretending a confirmation code was sent.
      const alreadyRegistered =
        Array.isArray(data.user?.identities) && data.user.identities.length === 0;
      if (alreadyRegistered) {
        setErrors({ email: "An account with this email already exists. Sign in instead." });
        setAnnouncement("An account with this email already exists.");
        return;
      }
      // Email confirmation is required. Rather than an emailed link -- which
      // only works back on the exact device/browser the form was filled out
      // on -- the patient gets a 6-digit code by email and types it in here,
      // which works from any device. Take them straight to that screen.
      setAnnouncement("Account created. Check your email for a confirmation code.");
      router.push(`/auth/verify?email=${encodeURIComponent(trimmedEmail)}`);
    } catch {
      const message = "We couldn't reach the sign-up service. Please try again.";
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

      <AuthTabs active="sign-up" />

      <h1 className={styles.title}>Create your patient account</h1>
      <p className={styles.subtitle}>
        Register to explore MCC services, book appointments, and manage your clinic visits.
      </p>

      {formError ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {formError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className={styles.form}>
        <FormField label="Full name" htmlFor="fullName" error={errors.fullName} required>
          {({ describedBy }) => (
            <Input
              id="fullName"
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              invalid={Boolean(errors.fullName)}
              aria-describedby={describedBy}
              autoComplete="name"
              disabled={submitting}
            />
          )}
        </FormField>

        <FormField label="Email" htmlFor="email" error={errors.email} required>
          {({ describedBy }) => (
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={Boolean(errors.email)}
              aria-describedby={describedBy}
              autoComplete="email"
              disabled={submitting}
            />
          )}
        </FormField>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={submitting}
        />
        <PasswordStrengthMeter password={password} />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
          autoComplete="new-password"
          placeholder="Re-enter your password"
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
          {submitting ? "Creating account…" : "Create Account"}
        </Button>
      </form>

      <p className={styles.note}>
        Doctor and reception accounts are provided by MCC administration.
      </p>

      <div className={`${styles.links} ${styles.linkCenter}`}>
        <Link href="/auth/sign-in" className={styles.link}>
          Already have an account? Sign In
        </Link>
      </div>
    </AuthShell>
  );
}
