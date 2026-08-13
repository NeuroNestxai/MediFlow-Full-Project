"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

/**
 * Signs the current patient out via Supabase Auth, then returns them to the
 * public landing page. Any failure is swallowed (no private detail surfaced)
 * and the user is still routed away — a stale session cannot keep them "signed in".
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Nothing safe to show — proceed to the landing page regardless.
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <Button variant="destructive" onClick={onSignOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign Out"}
    </Button>
  );
}
