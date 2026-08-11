# MediFlow — Supabase security hardening (PII isolation)

Project `padokkwfeoxsnwitwkty` (ap-northeast-1, Postgres 17). Applied 2026-08-11.

This is the DB-side implementation of the PII-isolation remediation. It is
**additive and non-breaking**: nothing the current app reads has been removed
yet. The one enforcement step that must be coordinated with the frontend is kept
out of the auto-applied migrations — see [§7 Cutover](#7-cutover).

---

## 1. What was wrong

- The doctor dashboard's "AI-Organized Patient Summary" showed the patient's
  **first name**. Root cause: the dashboard reads `public.profiles.full_name`
  directly, and the `profiles_select_staff` RLS policy let doctors read their
  patients' profiles (name + phone included). The empty `patients` table was
  **not** the source.
- No boundary stopped the AI agent (running with a broad key) from reaching
  identity PII.
- `civil_id` had nowhere encrypted to live; identity and clinical data were
  mixed in one table.

Verified along the way: **passwords are pure Supabase Auth** (`auth.users.
encrypted_password`, bcrypt) — no custom password column exists, nothing to
rebuild (requirement 5). The **QR flow already encodes only the booking
`reference`** — unchanged (requirement 3).

## 2. Target data model

```
auth.users ──┬── public.profiles          (id, full_name, phone …)  ← app/self + reception
             │
             ├── public.patients          IDENTITY VAULT (req 4)
             │     patient_id (MF######), user_id, full_name, age, gender,
             │     email, civil_id_encrypted (pgcrypto + Vault)
             │     RLS: admin / reception / self.  NEVER doctor, NEVER agent.
             │
             ├── public.patient_clinical   CLINICAL (req 1) — agent's source
             │     user_id, medical_history, current_medications, allergies,
             │     presenting_symptoms.  No identity fields.
             │
             └── public.visit_summaries    AI VISIT SUMMARY (req 7)
                   appointment_id, patient_user_id, summary …

agent schema (role mediflow_agent only)     ← the agent's ENTIRE world
   agent.patient_clinical      (view)  patient_id + clinical, no identity
   agent.appointment_context   (view)  reference + patient_id + status …
   agent.record_symptoms(patient_id, symptoms)      (write)
   agent.write_visit_summary(reference, summary)     (write)

public.email_outbox   Gmail queue (req 6). service_role only. Not the agent.
public.dashboard_*    role-scoped views for every dashboard (req 2, 8)
```

Applied migrations (`supabase/migrations/`, versions match the live DB history):

| Version | Purpose |
|---|---|
| `…152527_sec_01` | `private.is_admin/is_staff`; advisor lint fixes; revoke EXECUTE on trigger fns |
| `…152614_sec_02` | Vault key + `pgcrypto` encrypt/decrypt primitives for civil_id |
| `…152825_sec_03` | Identity vault (`patients`) + `patient_clinical`; admin civil_id accessors; vault-on-signup |
| `…153005_sec_04` | `pending_approval` enum value (before `scheduled`) |
| `…153023_sec_05` | `email_outbox` + `visit_summaries` |
| `…153139_sec_06` | Approval flow: booking → pending; `approve_appointment` → scheduled + Gmail |
| `…153238_sec_07` | `agent` schema + `mediflow_agent` role + grants |
| `…153739_sec_08` | Role-scoped dashboard views; denormalized `patient_ref` (MF) on appointments |

## 3. Verification evidence

- Backup `backup_20260811` schema: all 18 tables snapshotted, row counts match
  source exactly.
- Encryption round-trips (`private.encrypt_civil_id`/`decrypt_civil_id`); key
  never leaves the DB.
- Identity vault populated: 4 patient users each got an `MF######` id + name +
  email; `civil_id` null (none collected yet).
- Agent grant boundary (`has_*_privilege` for `mediflow_agent`):
  reads `agent.patient_clinical` / `agent.appointment_context` = **true**;
  reads `patients` / `profiles` / `email_outbox` / clinical base /
  visit base = **false**; execute `approve_appointment` /
  `admin_get_patient_civil_id` = **false**.
- Doctor summary view columns: `appointment_id, reference, patient_id,
  appointment_date, status, medical_history, current_medications, allergies,
  presenting_symptoms, ai_visit_summary, …` — **no name/email column**.

## 4. Advisor status after hardening

Fixed: mutable `search_path` (`set_updated_at`); trigger/auth functions
(`handle_new_user`, `tg_notify_*`, `appointments_log_status`,
`tg_mediflow_touch_thread`) no longer RPC-callable.

Remaining, and why they are acceptable:
- `SECURITY DEFINER function executable by authenticated` on the app RPCs
  (`create_patient_appointment`, `approve_appointment`, `admin_*_civil_id`,
  `staff_*`, `doctor_*`, …) — **intentional**. These *are* the API; each
  re-checks the caller's role internally via `private.is_*()`. `approve_*` and
  `admin_*_civil_id` hard-fail for non-admins.
- `email_outbox` "RLS enabled, no policy" — **intentional**. No policy means no
  API-role access; only `service_role` (bypass) reaches it.
- `Leaked password protection disabled` — a Dashboard toggle; enable it
  (see §6). Relates to requirement 5.

## 5. Integration — the AI agent (n8n / Gemini)

**Do NOT connect the agent with `service_role`.** `service_role` bypasses RLS
and every grant, which would undo all of the above. Connect as `mediflow_agent`.

1. Give the role a login + password (Supabase SQL Editor, as `postgres`):
   ```sql
   alter role mediflow_agent with login password '<generate-a-strong-secret>';
   ```
2. In n8n, use a **Postgres** credential (not the Supabase service key):
   - Host: `db.padokkwfeoxsnwitwkty.supabase.co`
   - Port: `5432` (direct) or the session pooler
   - Database: `postgres`
   - User: `mediflow_agent`  ·  Password: the secret above  ·  SSL: require
3. The agent's only operations:
   ```sql
   -- read clinical context by MF patient id (replaces the Excel sheet)
   select * from agent.patient_clinical      where patient_id = $1;
   -- read appointment context by booking reference
   select * from agent.appointment_context   where reference  = $1;
   -- record gathered symptoms
   select agent.record_symptoms($1 /* MF id */, $2 /* symptoms */);
   -- write the visit summary the doctor dashboard reads
   select agent.write_visit_summary($1 /* reference */, $2 /* summary */);
   ```
   Anything else (names, email, civil_id, the outbox, approvals) returns
   *permission denied* for this role. The agent never sees identity PII.

## 6. Integration — the rest

**Gmail node (n8n).** Use the **service_role** credential for this node (it is a
trusted backend, and the agent role deliberately cannot read the queue). Poll
and send:
```sql
select id, to_email, subject, body from public.email_outbox
where status = 'pending' order by created_at limit 20;
-- after sending:
update public.email_outbox set status='sent', sent_at=now() where id = $1;
-- on failure:
update public.email_outbox set status='failed', attempts=attempts+1, last_error=$2 where id=$1;
```

**Vercel dashboards.** Point each dashboard at its view (all are RLS-safe;
callers only ever see their own scope):
- Patient → `public.dashboard_patient_appointments`
- Doctor  → `public.dashboard_doctor_appointments`,
            `public.dashboard_doctor_patient_summary`  *(ID-only, no name)*
- Reception → `public.dashboard_reception_queue`
- Admin → `public.dashboard_admin_appointments`,
          `public.dashboard_admin_pending_approvals`

**Admin approval.** `select * from approve_appointment('<appointment uuid>');`
(admin JWT only) → flips `pending_approval` → `scheduled`, stamps
`approved_by/at`, and enqueues the Gmail confirmation.

**civil_id (admin only).**
```sql
select admin_set_patient_civil_id('<user uuid>', '784-1990-1234567-8'); -- encrypts
select admin_get_patient_civil_id('<user uuid>');                       -- decrypts
```
Plaintext is never stored; the ciphertext column is not even selectable over the
API.

**Auth.** Enable *Leaked password protection*: Dashboard → Authentication →
Sign In / Providers → Password → enable HaveIBeenPwned check.

## 7. Cutover

`supabase/security-cutover/20260811_sec_09_enforce_doctor_no_pii.sql` removes
doctors' legacy read of `public.profiles`, closing the name leak at the DB layer.
Run it **after** the doctor dashboard is deployed against the ID-only views. See
that folder's README. Until then the ID-only views are live and safe; only the
legacy `profiles` read remains open to doctors.

## 8. Backup & restore

Full pre-change snapshot lives in schema `backup_20260811` (not exposed to the
API). To restore a single table's data, e.g.:
```sql
truncate public.appointments;               -- careful
insert into public.appointments select * from backup_20260811.appointments;
```
Drop the snapshot once you're satisfied: `drop schema backup_20260811 cascade;`.
