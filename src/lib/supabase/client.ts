import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for use in Client Components.
 *
 * Reads the public URL + publishable key from the environment. These values
 * are safe to ship to the browser by design (that is the point of the
 * NEXT_PUBLIC_ prefix and the "publishable" key), but this module never logs
 * or otherwise surfaces them — callers only ever receive the configured
 * client instance.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(url, key);
}
