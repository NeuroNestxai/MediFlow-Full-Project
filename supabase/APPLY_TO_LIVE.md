# Applying the Doctor + Reception database layer

Everything here has been tested end to end against a throwaway PostgreSQL 14
cluster: all 11 migrations apply cleanly and a 36-check test drives the full
patient → reception → doctor → follow-up loop, including the permission
boundaries. See `supabase/tests/`.

You do **not** need the Supabase CLI or a database password. Everything below
is done from the Supabase dashboard.

Current live state: migrations `…0001` – `…0007` are already applied (the
patient side). You are adding `…20260803000001` – `…20260803000003`.

All three migrations are **idempotent** — re-running them is safe.

---

## Step 1 — Add the new appointment statuses

Dashboard → **SQL Editor** → **New query**. Paste the whole contents of:

```
supabase/migrations/20260803000001_extend_appointment_status.sql
```

Run it.

> **Why this one is on its own:** PostgreSQL will not let a new enum value be
> used in the same transaction that created it. Steps 2 and 3 use these
> values, so this must be committed first. Running it together with the others
> fails with `unsafe use of new value of enum type`.

Expected result: `Success. No rows returned.`

---

## Step 2 — Tables, permissions and role helpers

New query. Paste the whole contents of:

```
supabase/migrations/20260803000002_staff_workflows.sql
```

This adds:
- `doctors.user_id` — links a login to a doctor record (nothing doctor-side works without it)
- `private.is_doctor()`, `private.is_reception()`, `private.current_doctor_id()`
- staff read permissions on appointments, profiles, health records and documents
- the `consultations` and `follow_ups` tables

---

## Step 3 — The state-transition procedures

New query. Paste the whole contents of:

```
supabase/migrations/20260803000003_staff_transition_rpcs.sql
```

This adds the 9 stored procedures that are the **only** way staff may change an
appointment, extends patient notifications to the new statuses, and turns on
realtime for appointments so the dashboards update live.

---

## Step 4 — Create the two staff logins

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*.

Create both, and tick **Auto Confirm User** (otherwise they cannot sign in):

| Email | Password | Role |
|---|---|---|
| `doctor@mediflowom.com` | *(choose one, min 8 chars)* | doctor |
| `reception@mediflowom.com` | *(choose one)* | reception |

---

## Step 5 — Grant the roles and link the doctor

New query. Paste `supabase/seed/link_staff_accounts.sql` and run it.

It grants each account its role and links the doctor login to **Dr. Abbas
Pakkyara**, then prints what it did so you can confirm.

---

## Step 6 — Verify

New query. Paste `supabase/seed/verify_staff_setup.sql`.

Every row must say `OK`. If any says `MISSING`, re-run the step it names.

---

## What "done" looks like

After step 6:

- signing in as `reception@mediflowom.com` lands on `/reception/dashboard`
- signing in as `doctor@mediflowom.com` lands on `/doctor/dashboard`
- a patient booking is visible to reception, and to Dr. Abbas Pakkyara only
- another doctor's account sees nothing of it

The screens themselves still need building — see `docs/BUILD_GUIDE.md`.

---

## If something goes wrong

| Message | Meaning | Fix |
|---|---|---|
| `unsafe use of new value of enum type` | Steps 1 and 2 were run together | Run step 1 alone, then step 2 |
| `type "appointment_status" does not exist` | Step 1 never ran | Run step 1 |
| `relation "public.profiles" does not exist` | Wrong project selected | Check the project in the dashboard |
| `permission denied for schema private` | Step 2 partially applied | Re-run step 2 — it is idempotent |

Nothing in these migrations drops or rewrites an existing table, column or
policy. The patient side is untouched.
