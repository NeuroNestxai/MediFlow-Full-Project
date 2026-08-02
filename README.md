# MediFlow AI — Frontend Foundation

A Next.js 16 (App Router + TypeScript, React 19) frontend foundation for
MediFlow AI, the MCC Clinic appointment and care-navigation product. Built
from the cleaned Figma file:
https://www.figma.com/design/GVxuAmdQTemCgNYe1fHuPw

This is a **foundation stage**: mock data only, no backend, no AI calls, no
real secrets. It establishes routes, design tokens, and a reusable component
library, and fully implements six representative screens end to end.

**Stack versions:** Next.js 16.2.12 (Active LTS), React 19.2, TypeScript 5.7,
ESLint 9 (flat config), Node.js 20.9+ required.

---

## ⚠️ Important: this codebase was written without a working `npm install`

The sandbox this project was built in has **no network access to the npm
registry**, so `next`, `eslint`, and their type packages could not be
installed or executed here. Every file was hand-written and manually
reviewed (import-path checks, "use client" directive checks, CSS-module
class cross-checks), but **`npm run dev`, `npm run build`, `npm run lint`,
and a full `npm run typecheck` have not actually been executed against
this code.** Please run them yourself as the first step after cloning —
see below.

---

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint      # eslint . (flat config — Next.js 16 removed `next lint`)
npm run typecheck
npm run build
```

Copy `.env.example` to `.env.local` if/when you start wiring up Supabase or
n8n (see notes at the bottom). Nothing in this stage reads any environment
variable — the app runs entirely on mock data.

Linting uses `eslint.config.mjs` (ESLint 9 flat config). Next.js 16 removed
`next lint` and no longer lints automatically during `next build` — the
`lint` script above must be run explicitly (e.g. in CI, before `build`).

---

## Folder structure

```
src/
  app/                     App Router routes and layouts
    auth/                  Role selection, sign-in/up, access requests
    patient/               Patient role routes + layout (top nav + bottom nav)
    doctor/                Doctor role routes + layout
    reception/             Reception/Admin role routes + layout
    states/demo/            Shared system-state reference screen
    layout.tsx             Root layout (wraps app in AccessibilityProvider)
    page.tsx               Redirects to /auth/role-selection
    globals.css            Resets, base typography, focus styles

  components/
    ui/                    Generic reusable controls (Button, Input, Dialog…)
    layout/                Top nav, mobile header, role-specific bottom navs
    cards/                 Domain cards (DoctorCard, AppointmentCard, …)
    ai/                    Flo orb, chat bubble, prompt/time-slot chips
    states/                Loading/Empty/Error/Offline/Permission panels
    accessibility/         AccessibilityProvider (context) + mode selector
    shared/                PlaceholderScreen used by not-yet-built routes

  data/                    Mock data (doctors, services, appointments, …)
  types/                   Shared TypeScript types
  hooks/                   useMediaQuery, useIsMobile, useIsTablet
  lib/                     cn() classnames helper, accessibility helpers
  styles/                  tokens.css — all design tokens, all 5 color modes
```

## Design tokens & accessibility modes

`src/styles/tokens.css` mirrors the Figma "Color / Semantic" variable
collection, including all **5 color-vision modes**: Standard, Protanopia,
Deuteranopia, Tritanopia, and Achromatopsia / Grayscale High Contrast. The
active mode is applied via `document.documentElement.setAttribute("data-color-mode", …)`,
managed by `AccessibilityProvider` and persisted to `localStorage` (a UI
preference only — no personal data). Try it live at `/patient/accessibility`.

**Rule enforced throughout the component library:** status is never
communicated by color alone. `StatusBadge`, `QRResultCard`, and every
`StatePanel` variant always pair color with an icon, a text label, and (for
errors) a distinct dashed border — see `src/lib/a11y.ts` for the
`describeStatus` helper used to generate accessible labels.

## Representative screens (fully implemented)

1. **Authentication** — `/auth/role-selection` (navigation) and
   `/auth/patient/sign-in` (real client-side validation with
   `aria-invalid`, `role="alert"` errors, and an `aria-live` announcement)
2. **Patient Dashboard** — `/patient/dashboard`, with a live loading/empty/error
   state switcher built into the appointment section
3. **Doctor Dashboard** — `/doctor/dashboard`
4. **Reception Dashboard** — `/reception/dashboard`
5. **Shared system states** — `/states/demo` (Loading, Empty, Error,
   Offline, Permission Denied, Session Expired)
6. **Accessibility settings** — `/patient/accessibility`, with a live badge
   preview that updates as you switch color modes

Every other route listed in the project spec exists and is reachable via
real navigation, but renders a `PlaceholderScreen` rather than a full
implementation — intentional for this stage, not an oversight.

## Accessibility support in this stage

- Keyboard navigation and visible focus rings (`:focus-visible`, app-wide)
- Semantic headings, real `<nav>`/`<fieldset>`/`<legend>` landmarks
- Accessible dialogs (`Dialog`, `BottomSheet`): focus trap, Escape to close,
  focus restored to the trigger on close
- Accessible form validation (`FormField` + `Input`/`Select`/`Textarea`):
  `aria-describedby`, `aria-invalid`, `role="alert"` errors
- `Toast` uses `role="status"`/`aria-live` (assertive for errors)
- Reduced-motion respected both via OS preference (`prefers-reduced-motion`)
  and an explicit in-app toggle
- Touch-friendly controls (44px minimum tap targets throughout)

## Medical-safety boundaries (intentional, do not remove)

This codebase deliberately contains **no diagnosis, prescription, medical
severity/urgency classification, or triage logic**, and invents no real
doctors/patients/services beyond the synthetic mock data already present.
Appointment status types (`src/types/index.ts`) are operational only
(confirmed / checked-in / waiting / etc.) — please keep it that way when
extending this code.

## Notes for future Supabase integration

Nothing here reads a Supabase client yet. When you're ready:
- Replace the files in `src/data/` with real fetches (server components or
  route handlers), keeping the same exported shapes in `src/types/index.ts`
  so downstream components don't need to change.
- Add `@supabase/supabase-js` / `@supabase/ssr` and initialize a client
  using `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
  `.env.local`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to client components.
- The `/auth/*` routes currently do no real authentication — swap the
  mock `router.push(...)` in `src/app/auth/patient/sign-in/page.tsx` for a
  real Supabase auth call once wired up.

## Notes for future n8n integration

- `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET` are placeholders in `.env.example`.
  Treat the webhook URL itself as a secret (it can trigger workflows).
- Likely first use case: appointment reminders and follow-up scheduling
  triggered from booking/consultation-completion actions — call these from
  a server-side route handler, never directly from client components.

## Recommended next implementation stage

1. Run `npm install && npm run dev/lint/typecheck/build` and fix whatever
   surfaces (expected to be minor, given the manual checks already passed —
   see the combined report for what was verified by hand).
2. Build out the full Patient Booking flow (currently a placeholder) — it
   has the richest interaction design in the Figma file (7-step stepper).
3. Build out the Doctor Consultation flow and Reception QR/Check-in flow.
4. Wire Supabase auth for real sign-in before building anything that
   depends on a real user session.
