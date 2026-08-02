import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Email-confirmation callback endpoint.
 *
 * Supports two flows and prefers the first:
 *
 *   A. Default PKCE callback (Supabase's locked `{{ .ConfirmationURL }}`
 *      template on the free/default provider): the link arrives with a
 *      `code`, which we exchange for a session via `exchangeCodeForSession`.
 *
 *   B. Custom token-hash callback (only reachable if a future custom
 *      SMTP/email template sends `token_hash` + `type`): verified with
 *      `verifyOtp`. Kept purely as a forward-looking fallback.
 *
 * On success the session cookies are written onto the redirect response by the
 * server client's cookie handlers, and the patient lands on their dashboard.
 * Anything missing/invalid/used/expired fails closed to the sign-in page with
 * a generic flag — never a raw error, code, token, or session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    // A. Prefer the PKCE `code` flow when a code is present.
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Role-based hand-off (confirmed self-registrations are patients).
        redirectTo.pathname = "/auth/post-login";
        return NextResponse.redirect(redirectTo);
      }
    } else if (tokenHash && type) {
      // B. Fallback for a future custom template that sends a token hash.
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) {
        // Role-based hand-off (confirmed self-registrations are patients).
        redirectTo.pathname = "/auth/post-login";
        return NextResponse.redirect(redirectTo);
      }
    }
  }

  // Missing/invalid/used/expired link, or unconfigured — fail closed.
  redirectTo.pathname = "/auth/sign-in";
  redirectTo.searchParams.set("error", "confirmation");
  return NextResponse.redirect(redirectTo);
}
