"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { HealthSection } from "./HealthSection";
import { createClient } from "@/lib/supabase/client";
import type { PatientProfile } from "@/lib/supabase/patient-auth";
import styles from "./page.module.css";

interface ProfileClientProps {
  /** Own profile row (server-loaded), or null if it doesn't exist. */
  profile: PatientProfile | null;
  /** Email from the authenticated Supabase user — read-only here. */
  email: string | null;
  /** True when RLS/an error prevented reading the profile server-side. */
  profileBlocked: boolean;
  /** Stable MediFlow patient ID (e.g. MF412300), or null if not available. */
  mfId: string | null;
}

export function ProfileClient({ profile, email, profileBlocked, mfId }: ProfileClientProps) {
  const nameId = useId();
  const preferredId = useId();
  const phoneId = useId();
  const emailId = useId();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [preferredName, setPreferredName] = useState(profile?.preferred_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");

  const [errors, setErrors] = useState<{ fullName?: string }>({});
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSavedMessage(null);

    const nextErrors: typeof errors = {};
    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setFormError("Your session has expired. Please sign in again to save changes.");
        return;
      }

      // Update only the signed-in user's row; RLS enforces ownership.
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          preferred_name: preferredName.trim() || null,
          phone: phone.trim() || null,
        })
        .eq("id", user.id);

      if (error) {
        // Blocked by RLS or another failure — show a safe, generic message.
        setFormError("We couldn't save your changes right now. Please try again.");
        return;
      }

      setSavedMessage("Your profile has been updated.");
      window.setTimeout(() => setSavedMessage(null), 4000);
    } catch {
      setFormError("We couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile &amp; Settings</h1>

      {mfId ? (
        <div className={styles.mfCard}>
          <span className={styles.mfLabel}>Your MediFlow ID</span>
          <span className={styles.mfValue}>{mfId}</span>
          <span className={styles.mfHint}>
            Share this ID with clinic staff and the MediFlow assistant. It never reveals your name
            or personal details.
          </span>
        </div>
      ) : null}

      {savedMessage ? (
        <div className={styles.toastWrap}>
          <Toast tone="success" message={savedMessage} onDismiss={() => setSavedMessage(null)} />
        </div>
      ) : null}

      {profileBlocked ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          We couldn&rsquo;t load your profile right now. You can still update your details below.
        </div>
      ) : null}

      <form onSubmit={onSaveProfile} noValidate className={styles.card}>
        <h2 className={styles.cardTitle}>Personal information</h2>

        {formError ? (
          <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
            {formError}
          </div>
        ) : null}

        <FormField label="Full name" htmlFor={nameId} error={errors.fullName} required>
          {({ describedBy }) => (
            <Input
              id={nameId}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              invalid={Boolean(errors.fullName)}
              aria-describedby={describedBy}
              autoComplete="name"
              disabled={saving}
            />
          )}
        </FormField>

        <FormField label="Preferred name" htmlFor={preferredId}>
          {({ describedBy }) => (
            <Input
              id={preferredId}
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              aria-describedby={describedBy}
              autoComplete="nickname"
              disabled={saving}
            />
          )}
        </FormField>

        <FormField label="Phone" htmlFor={phoneId}>
          {({ describedBy }) => (
            <Input
              id={phoneId}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby={describedBy}
              autoComplete="tel"
              disabled={saving}
            />
          )}
        </FormField>

        <FormField label="Email" htmlFor={emailId} hint="Email can't be changed here.">
          {({ describedBy }) => (
            <Input
              id={emailId}
              type="email"
              value={email ?? ""}
              readOnly
              aria-describedby={describedBy}
            />
          )}
        </FormField>

        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>

      <HealthSection />

      <div className={styles.linksCard}>
        <Button variant="secondary" href="/patient/documents">
          Documents
        </Button>
        <Button variant="secondary" href="/patient/accessibility">
          Accessibility Settings
        </Button>
        <SignOutButton />
      </div>
    </div>
  );
}
