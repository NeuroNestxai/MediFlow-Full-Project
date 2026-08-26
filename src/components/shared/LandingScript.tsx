"use client";

import { useEffect } from "react";

/**
 * Executes the landing page's interactive behaviour (chat demo, doctor
 * carousel, phone tilt, floating dock, Privacy/Terms dialogs, etc.).
 *
 * Browsers deliberately do not execute <script> tags that arrive via
 * innerHTML (which is what dangerouslySetInnerHTML uses) — this is a
 * long-standing security behaviour, not a bug. The reliable fix is to
 * create a real <script> DOM node and append it, which browsers *do*
 * execute. That's all this component does.
 */
export function LandingScript({ code }: { code: string }) {
  useEffect(() => {
    const script = document.createElement("script");
    script.textContent = code;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [code]);

  return null;
}
