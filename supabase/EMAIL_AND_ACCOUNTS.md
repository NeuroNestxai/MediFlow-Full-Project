# Creating accounts, and why Supabase stops you

## What actually happened

Supabase gives every project a **shared, built-in email service** for confirmation
links, password resets and OTPs. It is deliberately rate-limited — only a few
messages per hour on the free plan — because it is a shared resource and an open
signup form is a spam cannon if nobody limits it.

When you add a user in the dashboard **without** ticking *Auto Confirm User*,
Supabase tries to send that user a confirmation email. Two users went through,
the third hit the hourly limit, and the whole creation failed.

So the limit is **on sending email**, not on creating accounts. That distinction
is the fix.

---

## Fix 1 — Auto Confirm (use this now)

**Authentication → Users → Add user → tick "Auto Confirm User".**

With it ticked, no email is sent at all, so there is no limit to hit. The account
is created already-verified and can sign in immediately.

This is right for staff accounts anyway. A receptionist does not confirm her own
work address — an administrator creates her account and hands it to her. Email
confirmation exists to prove someone owns an address they typed in themselves,
which is a patient-signup problem, not a staff-account problem.

**Then run `seed/confirm_staff_emails.sql`** to confirm the two accounts you
already made and show you the state of all five.

---

## Fix 2 — Use your own mail server (the real answer)

MCC already runs email on Hostinger at `mccoman.com`. Pointing Supabase at that
mailbox removes the shared limit completely, and it is what any real deployment
does — the built-in service is explicitly labelled as being for development only.

**Project Settings → Authentication → SMTP Settings → Enable Custom SMTP:**

| Field | Value |
|---|---|
| Host | `smtp.hostinger.com` |
| Port | `465` (SSL) — or `587` for STARTTLS |
| Username | the full mailbox address, e.g. `no-reply@mccoman.com` |
| Password | that mailbox's password |
| Sender email | the same address |
| Sender name | `MediFlow AI` |

Confirm the exact host and port against Hostinger's own documentation before
relying on it — providers change them.

Two things worth knowing:

- **Use a dedicated mailbox** such as `no-reply@mccoman.com`, not a person's
  account. Password resets should not arrive from a doctor's inbox, and nobody
  should have to change application config because a staff member left.
- Once custom SMTP is on, the rate limit becomes **your mail provider's**
  limit. Hostinger's is far higher than Supabase's shared allowance, but it is
  not infinite.

---

## Fix 3 — Turn email confirmation off (prototype only)

**Authentication → Sign In / Providers → Email → "Confirm email" OFF.**

Every signup, patient or staff, becomes active immediately. No email is sent, so
the limit stops applying to *everything* — including patients testing with their
own personal addresses.

Be straight about the tradeoff. With confirmation off, anyone can register using
an address they do not own. That is acceptable in a prototype where the whole
patient list is synthetic, and unacceptable in production, where a real clinic
would have it **on** and run its own SMTP (Fix 2) so the limit never bites.

Deciding this deliberately — and being able to say why — is the difference
between a shortcut and an engineering decision.

### Which email can a patient use?

Any. Patient sign-up is self-service and unrestricted by design, so a personal
Gmail works fine for testing. Staff are the opposite: doctor and reception
accounts are created by an administrator and are meant to be restricted to
approved `@mccoman.com` work addresses.

If you test with a real personal inbox, remember it ends up attached to a
patient record in the clinic database. Use one you do not mind appearing in a
demo system.

---

## Fix 4 — Just wait

The limit is hourly. Doing nothing for an hour also clears it. Fine if you are
not in a hurry; not useful the night before a demo.

---

## What NOT to do

**Do not insert into `auth.users` with SQL.** It looks like it works. The table
has columns that GoTrue (Supabase's auth service) manages itself — password
hashing format, identity records, confirmation tokens, metadata — and a row that
is missing or malformed in any of them produces accounts that fail to sign in,
or fail later at password reset, in ways that are genuinely hard to debug.

The rule generalises: **write to a service's own tables through that service.**
The dashboard, the admin API and the client SDK all go through GoTrue. Raw SQL
does not.

---

## The order to do things in

1. Create all five accounts with **Auto Confirm User** ticked
2. Run `seed/confirm_staff_emails.sql` — every row should read `confirmed`
3. Run `seed/link_staff_accounts.sql` — grants roles, links doctors to records
4. Run `seed/verify_staff_setup.sql` — 27 rows, all `OK`

Steps 2–4 are safe to re-run as many times as you like.
