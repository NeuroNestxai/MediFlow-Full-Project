import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions (Next.js App Router).
 *
 * Wires Supabase's auth cookie handling into Next's cookie store so sessions
 * are read/refreshed correctly. As with the browser client, the URL and key
 * are never logged or returned to callers — only the configured client is.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` is called from a Server Component render, where mutating
          // cookies is not allowed. This can be safely ignored when session
          // refresh is handled by middleware (not wired up in this stage).
        }
      },
    },
  });
}

/**
 * Returns whether the Supabase environment variables are present, without
 * ever exposing their values. Used by the dev connection check to distinguish
 * a missing configuration from a genuine connection failure.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
