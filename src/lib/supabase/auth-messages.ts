import type { AuthError } from "@supabase/supabase-js";

/**
 * Maps a Supabase {@link AuthError} to a safe, user-facing message.
 *
 * Only the stable, non-sensitive `error.code` is inspected — the raw
 * `error.message`, status, tokens, and any other internal detail are never
 * surfaced. Anything unrecognized falls back to the caller's generic message.
 */
export function safeAuthMessage(error: AuthError | null, fallback: string): string {
  if (!error) return fallback;

  switch (error.code) {
    case "invalid_credentials":
      return "The email or password you entered is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email address, then sign in.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return "Please choose a stronger password (at least 8 characters).";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a moment and try again.";
    case "validation_failed":
      return "Please check the details you entered and try again.";
    case "otp_expired":
      return "That code has expired. Request a new one below.";
    case "otp_disabled":
      return "That code isn't valid. Request a new one below.";
    default:
      return fallback;
  }
}
