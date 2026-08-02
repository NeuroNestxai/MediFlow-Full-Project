import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { AccessibilityProvider } from "@/components/accessibility/AccessibilityProvider";
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
  description: "MCC Clinic appointment and care-navigation prototype (frontend foundation).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AccessibilityProvider>
          <div id="main-content">{children}</div>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
