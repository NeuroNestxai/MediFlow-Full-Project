import type { ReactNode } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { Manrope, Inter } from "next/font/google";
import { AccessibilityProvider } from "@/components/accessibility/AccessibilityProvider";
import { AppearanceProvider } from "@/components/appearance/AppearanceProvider";
import "./globals.css";

// Load the actual Figma-specified typefaces (Manrope for display type, Inter
// for body/UI text) as optimized, self-hosted fonts instead of relying on
// the system-font fallback stack. Each exposes a CSS variable consumed by
// tokens.css (--font-display / --font-body), with `display: swap` so text
// remains visible while the font loads.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MediFlow AI",
  description: "MCC Clinic appointment and care-navigation platform.",
};

// Runs before first paint (in <head>), so the saved accessibility + appearance
// preferences are applied to <html> synchronously — no flash of the default
// theme/mode, and no flash of white before dark mode restores.
const NO_FLASH_SCRIPT = `(function(){try{var d=document.documentElement;
var a={};try{a=JSON.parse(localStorage.getItem("mediflow.accessibility")||"{}")||{}}catch(e){}
if(a.colorMode)d.setAttribute("data-color-mode",a.colorMode);
if(typeof a.reducedMotion==="boolean")d.setAttribute("data-reduced-motion",String(a.reducedMotion));
else if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)d.setAttribute("data-reduced-motion","true");
if(typeof a.largeText==="boolean")d.setAttribute("data-large-text",String(a.largeText));
var ap=localStorage.getItem("mediflow.appearance")||"system";
var dark=ap==="dark"||(ap!=="light"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);
d.setAttribute("data-theme",dark?"dark":"light");}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        {/* Applies saved theme + accessibility preferences to <html> before the
            first paint (no flash, no wrong theme). Rendered via next/script with
            the beforeInteractive strategy so Next injects it into the initial
            HTML — React never treats it as a component-rendered <script>, so
            there is no runtime warning. */}
        <Script
          id="mediflow-no-flash"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }}
        />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppearanceProvider>
          <AccessibilityProvider>
            <div id="main-content">{children}</div>
          </AccessibilityProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
