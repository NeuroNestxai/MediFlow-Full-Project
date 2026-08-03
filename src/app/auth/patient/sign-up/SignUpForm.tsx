"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { createClient } from "@/lib/supabase/client";
import { safeAuthMessage } from "@/lib/supabase/auth-messages";
import styles from "./page.module.css";

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
    setSuccessMessage(null);
    if (!validate()) {
      setAnnouncement("There are errors in the form. Please review the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setAnnouncement("Creating your account…");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Route the confirmation link through our SSR callback endpoint so
          // clicking it establishes a real session, then lands on the dashboard.
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
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

      // When email confirmation is required, no session is returned yet — the
      // patient must click the link in their email to finish.
      if (data.session) {
        setAnnouncement("Account created. Taking you to your dashboard…");
        router.replace("/auth/post-login");
        router.refresh();
        return;
      }

      const message =
        "Account created. Check your email and open the confirmation link to finish setting up your account.";
      setSuccessMessage(message);
      setAnnouncement(message);
    } catch {
      const message = "We couldn't reach the sign-up service. Please try again.";
      setFormError(message);
      setAnnouncement(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell active="create-account">
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>
      <div>
        <h1 className={styles.title}>Create your patient account</h1>
        <p className={styles.subtitle}>
          Register to explore MCC services, book appointments, and manage your clinic visits.
        </p>

        {formError ? (
          <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
            {formError}
          </div>
        ) : null}
        {successMessage ? (
          <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
            {successMessage}
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

          <FormField label="Password" htmlFor="password" error={errors.password} required>
            {({ describedBy }) => (
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={Boolean(errors.password)}
                aria-describedby={describedBy}
                autoComplete="new-password"
                disabled={submitting}
              />
            )}
          </FormField>

          <FormField
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword}
            required
          >
            {({ describedBy }) => (
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                invalid={Boolean(errors.confirmPassword)}
                aria-describedby={describedBy}
                autoComplete="new-password"
                disabled={submitting}
              />
            )}
          </FormField>

          <Button type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? "Creating Account…" : "Create Account"}
          </Button>
        </form>

        <div className={styles.links}>
          <Link href="/auth/sign-in" className={styles.link}>
            Already have an account? Sign In
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
