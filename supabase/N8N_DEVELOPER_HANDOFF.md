# MediFlow — n8n / Gemini developer handoff (data & security)

This explains what the database now enforces, which data the AI agent may use vs.
which it must never see, how each side is secured, what it protects against, and
the exact steps to wire n8n up. Companion to `SECURITY_HARDENING.md`.

## 1. The two "sheets"

| | Sheet A — Agent/Clinical (shared with Gemini) | Sheet B — Identity Vault (NEVER shared with Gemini) |
|---|---|---|
| Table | `public.patient_clinical` (+ appointment context) | `public.patients` |
| Holds | `patient_id` (MF#####), medical history, medications, allergies, symptoms | full name, age, gender, email, **encrypted** civil ID |
| Agent reaches via | the `agent` schema (views + functions) | nothing — agent role is fully blocked |
| Used for | Gemini builds the visit summary → written back → shown on doctor dashboard; appointment status in the QR/check-in flow | admin + reception dashboards; Gmail confirmation email; patient's own profile |
| Secured by | dedicated DB role + grants + RLS | RLS (admin/reception/self) + pgcrypto + column lock |

Golden rule: the agent only handles **patient_id + reference + clinical/symptoms**.
It cannot fetch a name, email, or civil ID — the database denies it.

## 2. The agent's entire allowed surface (role `mediflow_agent`)

| Operation | Object | Returns / does | Name/email? |
|---|---|---|---|
| Read clinical | `agent.patient_clinical` (view) | patient_id + medical_history, medications, allergies, symptoms | No |
| Read appointment | `agent.appointment_context` (view) | reference, patient_id, date/time, status, service, doctor name | No |
| Write symptoms | `agent.record_symptoms(patient_id, symptoms)` | saves symptoms for the patient | No |
| Write summary | `agent.write_visit_summary(reference, summary)` | saves the AI visit summary onto the appointment | No |

Anything else (`patients`, `profiles`, `email_outbox`, approvals, civil-ID
decryption) returns **permission denied** for this role.

## 3. Linkage (how the IDs connect)

| Key | Looks like | Who uses it | Sensitive |
|---|---|---|---|
| `user_id` | UUID | internal DB joins only | no (internal) |
| `patient_id` | `MF526493` | the agent + all dashboards | no (pseudonymous) |
| `reference` | `REF-2026-000123` | the agent, the QR code, check-in | no |

One patient = one `auth.users` login = one `profiles` row = one `patients` vault
row (holds the MF id + identity) = one optional `patient_clinical` row. The agent
uses `patient_id` + `reference`; the DB translates them to `user_id` **inside**
the secure functions, so the mapping never leaves the database.

### Exact n8n flow
1. From booking / QR, take `patient_id` (MF) and/or `reference`.
2. `select * from agent.patient_clinical where patient_id = :mf;`
3. `select * from agent.appointment_context where reference = :ref;`
4. Send ONLY `patient_id + symptoms + clinical` to Gemini → get summary.
5. `select agent.record_symptoms(:mf, :symptoms);`
6. `select agent.write_visit_summary(:ref, :summary);`
7. Doctor dashboard reads `visit_summaries` automatically; QR/check-in moves the
   appointment through its statuses.

Never `select from public.patients` / `public.profiles` with the agent role — it
is denied by design.

## 4. How each side is secured, and against what

| Control (using what) | What it does | Protects from |
|---|---|---|
| Dedicated `mediflow_agent` role + least-privilege grants | agent sees only clinical-by-ID | LLM/prompt-injection leaks; leaked agent creds = tiny blast radius |
| Row-Level Security on every table | each row visible only to the right user/role | broken access control / IDOR / cross-patient snooping |
| `SECURITY DEFINER` functions, fixed `search_path` | controlled, validated write paths | privilege escalation; search-path hijack |
| pgcrypto + Supabase Vault | civil ID encrypted at rest; key in Vault | database dump / data-at-rest breach |
| Column-level lock on civil ID | ciphertext not selectable via API | data minimization |
| Supabase Auth bcrypt + MFA (TOTP) + strong rules + rate limits | strong logins | credential stuffing; account takeover; brute force |
| `email_outbox` locked to `service_role` | only the Gmail node reads emails | PII leak via the email queue |
| No anonymous access | logged-out users get nothing | unauthenticated scraping |

## 5. Pending work

| # | Task | Owner | Why |
|---|---|---|---|
| 1 | Point Gemini/DB nodes at `mediflow_agent`; remove `service_role` | n8n dev | MOST IMPORTANT — service_role bypasses everything |
| 2 | `alter role mediflow_agent with login password '<secret>';` | you (SQL editor, once) | role is NOLOGIN until then |
| 3 | Keep the Gmail node on `service_role` | n8n dev | it must read `email_outbox`; the agent must not |
| 4 | Repoint dashboards to the new `dashboard_*` views | frontend dev | doctor view is name-free |
| 5 | Enforce MFA for admin/staff accounts | you | account-takeover protection |

### n8n Postgres connection (task 1)
Host `db.padokkwfeoxsnwitwkty.supabase.co` · Port `5432` (or `6543` pooler) ·
Database `postgres` · User `mediflow_agent` · Password (task 2) · SSL: require

### Gmail node (unchanged)
Uses `service_role`. Poll and send:
```sql
select id, to_email, subject, body from public.email_outbox
where status='pending' order by created_at limit 20;
update public.email_outbox set status='sent', sent_at=now() where id = :id;
```
