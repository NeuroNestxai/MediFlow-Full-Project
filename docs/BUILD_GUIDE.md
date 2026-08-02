# Building the Doctor and Reception screens

The database and data layer are done and tested. **You build the screens.**

This guide tells you, for each screen: what it shows, which function to call,
and which existing file to copy the pattern from. Nothing here needs new SQL —
if you find yourself wanting to write a database query, check this list first,
because the function almost certainly already exists.

---

## 1. What is already done

- **Every patient screen.** Booking, appointments, QR, documents, health info,
  notifications, Ask MediFlow. These are your reference for how a screen is
  built in this codebase.
- **Sign-in and roles.** `/auth/sign-in` handles all three roles. The role is
  read from the database server-side and enforced twice — in `src/proxy.ts` at
  the edge and again in every page. You do not need to check permissions in
  your components; if a doctor somehow opens a reception URL they are already
  redirected before your code runs.
- **The whole database layer for staff** — see §3.

## 2. What you are building

20 screens are currently 4-line placeholders. Build them in the order below;
the first six are the demo path and matter most.

---

## 3. The functions you call

All of these live in **`src/lib/staff/client-data.ts`**. Import and call them —
they handle errors, and they never expose raw database errors to the user.

### Reading

```ts
fetchStaffAppointments({ date?, statuses? })  // reception: whole clinic · doctor: their own
fetchAppointmentById(id)
fetchReportedHealth(patientId)   // doctor only — allergies + medications
fetchConsultation(appointmentId)
fetchFollowUps()
```

You never filter by doctor yourself. The database already scopes the results:
reception gets the whole clinic, a doctor gets only their own appointments.
That is a security boundary, not a convenience — do not re-implement it in JS.

### Reception actions

```ts
lookupAppointment(reference)        // QR scan or typed REF-2026-000123
checkInAppointment(appointmentId)
updateQueueStatus(appointmentId, "waiting" | "no_show")
checkOutAppointment(appointmentId)
```

### Doctor actions

```ts
startConsultation(appointmentId)
saveConsultationNotes(appointmentId, notes)   // call this on a timer to autosave
completeConsultation(appointmentId)
markNoShow(appointmentId)
createFollowUp({ appointmentId, followUpType, dueDate, instructions,
                 setReminder, newAppointmentRequired, internalNotes, approve })
```

### Live updates

```ts
const unsubscribe = subscribeToAppointments(() => reload());
// call unsubscribe() in the cleanup of your useEffect
```

That is what powers "Live updates active" on both dashboards. When reception
checks someone in, the doctor's screen updates with no refresh.

### Every action returns a result object — never a thrown error

```ts
const result = await checkInAppointment(appt.id);
if (result.ok) {
  showToast(`${result.reference} checked in`);
} else if (result.reason === "not_allowed") {
  showToast("This patient cannot be checked in right now.");
} else {
  showToast("Something went wrong. Please try again.");
}
```

Handle `ok: false` every time. `reason` is one of `not_allowed`, `not_found`,
`error` (and `not_linked` for doctor actions).

---

## 4. The appointment lifecycle

```
scheduled ─▶ confirmed ─▶ checked_in ─▶ waiting ─▶ in_consultation
                                                        │
                                                        ▼
                                                    completed ─▶ checked_out
        cancelled and no_show branch off at any earlier point
```

| Transition | Who does it | Screen |
|---|---|---|
| → `checked_in` | Reception | QR Scan → confirm identity → Check In |
| → `waiting` | Reception | Live Queue |
| → `in_consultation` | Doctor | Consultation Workspace |
| → `completed` | Doctor | Complete Consultation dialog |
| → `checked_out` | Reception | Checkout |

`completed` means the consultation is finished. An appointment that is
`completed` but not yet `checked_out` is what Reception lists under **Ready for
Checkout** — there is no separate status for it.

**You cannot skip a step.** The database rejects it. Trying to check someone
out who has not been seen returns `not_allowed`. This is deliberate: it means a
double-click or a double QR scan can never corrupt the demo.

Import labels and colours — do not write your own:

```ts
import { DB_STATUS_LABEL, DB_STATUS_TONE } from "@/lib/patient/types";
<StatusBadge tone={DB_STATUS_TONE[appt.status]} label={DB_STATUS_LABEL[appt.status]} />
```

`StatusBadge` always renders an icon and text alongside the colour. Never show
status by colour alone — that rule is enforced across the whole app and the
teacher's brief calls it out explicitly.

---

## 5. Build order

### The demo path — build these six first

**1. `reception/qr-scan`** — *Mobile QR*
Camera preview plus a manual "enter booking reference" box. Call
`lookupAppointment(ref)`. Show patient name, doctor, service, date/time. Then
an **identity confirmation** step, then a **Check In** button calling
`checkInAppointment()`.
Build the manual box first — it always works, and it is your fallback if the
camera fails on the night.

**2. `reception/queue`** — *Live Queue*
`fetchStaffAppointments({ date: today, statuses: IN_CLINIC_STATUSES })`.
Filter pills: All / Checked In / Waiting / In Consultation. Each row gets a
**Move to Waiting** button (`updateQueueStatus(id, "waiting")`) and **Mark No
Show**. Subscribe to live updates.

**3. `doctor/dashboard`** — *replace the hardcoded numbers*
It currently shows `value={3}` typed by hand. Replace with counts from
`fetchStaffAppointments({ date: today })`. Today's schedule list comes from the
same call. Subscribe to live updates so patients appear as reception checks
them in.

**4. `doctor/patient-summary`** — *AI-Organized Patient Summary*
`fetchAppointmentById()` for the appointment plus `fetchReportedHealth()` for
allergies and medications. Keep the banner *"AI-organized summary — doctor
review required before clinical use."* Tag each section **PATIENT-REPORTED** or
**AI-ORGANIZED** — the provenance chips are a requirement, not decoration.

**5. `doctor/consultation`** — *Consultation Workspace*
Three columns: patient summary · notes textarea · status and actions.
`startConsultation()` on open. Autosave the textarea with
`saveConsultationNotes()` on a ~2 second debounce and show "Draft saved".
**Complete Consultation** opens a confirmation dialog (use the existing
`Dialog` component) and calls `completeConsultation()`.

**6. `reception/checkout`** — *Checkout*
`fetchStaffAppointments({ date: today, statuses: ["completed"] })` is your
"Ready for Checkout" list. **Check Out** calls `checkOutAppointment()`, then
show the success screen.

That is the full loop. Once these six work, the demo works.

### Then

**7. `doctor/follow-ups` + follow-up creation** — `fetchFollowUps()` and
`createFollowUp()`. Two buttons: **Save Draft** (`approve: false`) and
**Approve and Send** (`approve: true`). Only approving sends it to the patient
— the database enforces that, a draft is invisible to them.

**8. `doctor/appointments`, `doctor/patients`, `reception/appointments`,
`reception/patients`** — list and filter views over `fetchStaffAppointments()`.
Mostly the same component with different filters.

**9. `doctor/schedule`, `reception/doctors`, notifications, profiles** — lower
priority, safe to leave as placeholders for the demo.

---

## 6. How to build a screen in this codebase

Copy the pattern from a patient screen that already works.

**Best model: `src/app/patient/appointments/`**

```
page.tsx                 server component — checks the role, renders the client
AppointmentsClient.tsx   "use client" — fetches, holds state, handles actions
page.module.css          styles
```

For a doctor page, `page.tsx` looks like:

```tsx
import { requireDoctor } from "@/lib/supabase/staff-auth";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const doctor = await requireDoctor();   // redirects if not a linked doctor
  return <QueueClient doctorName={doctor.fullName} />;
}
```

Reception uses `requireReception()` the same way.

Reuse the existing components rather than writing new ones — `Button`,
`StatusBadge`, `Dialog`, `Toast`, `FormField`, `Input`, `Tabs`, `QueueCard`,
`DoctorPortrait`, `StatePanel`. They already handle keyboard access, focus
traps and screen readers.

Every screen needs its **loading, empty and error** states. `StatePanel`
(`src/components/states/`) gives you all of them; `/states/demo` shows each one
rendered.

---

## 7. Rules that are not negotiable

These come from the project brief and are enforced in the database, so
breaking them will fail rather than slip through:

- **No diagnosis, prescription, severity or urgency anywhere.** Statuses are
  operational only. Consultation notes are free text written by the clinician.
- **Reception cannot see clinical information.** They have no read access to
  consultation notes or follow-up instructions at all — not hidden in the UI,
  actually unreadable. Do not try to route around it.
- **A doctor sees only their own patients.** Another doctor's appointments
  return zero rows.
- **Nothing reaches the patient until the doctor approves it.** Follow-up
  drafts are invisible to patients.
- **Status is never colour alone.** Always icon + text + colour.

---

## 8. Checking your work

```bash
npm run typecheck    # must pass before you commit
npm run lint
npm run dev
```

To test the full loop locally:

1. Sign in as a patient, book an appointment, note the `REF-…`
2. Sign in as `reception@mediflowom.com`, look up that reference, check in
3. Move them to waiting in the Live Queue
4. Sign in as `doctor@mediflowom.com` — they should already be on the dashboard
5. Start the consultation, write a note, complete it
6. Back as reception, check them out
7. As the doctor, create and approve a follow-up
8. As the patient, confirm the follow-up and the notifications arrived

Use three different browsers (or private windows) so you can stay signed in as
all three at once — that also makes the live updates obvious during the demo.

The same loop is tested at the database level in
`supabase/tests/e2e_three_roles.sql`, so if a step fails, the problem is in
your screen and not underneath it.
