# MediFlow — Governance & oversight hardening

Four additions that strengthen the AI Safety / Ethics / Oversight posture.
All applied live (migrations sec_16 - sec_19) and verified.

## 1. Data-use consent (`patient_consents`)

Backend for the "clear data-use disclaimer" the evaluator asked for. The frontend
shows the disclaimer ("your symptoms — not your name — are shared with an AI");
the patient's acceptance is recorded here, versioned.

- Table `patient_consents` (user_id, consent_type, version, granted, granted_at).
- RPC `record_consent(consent_type, version, granted)` (patient).
- RLS: patient own; admin/reception can read.

## 2. Audit log (`audit_log`)

Append-only trail of sensitive actions — **admin-readable only**, written only via
the definer helper `private.log_audit(...)` (never directly by API roles).

Logged actions: `civil_id_set`, `civil_id_decrypt`, `appointment_approved`,
`appointment_rejected`, `slot_offer_approved`, `slot_offer_rejected`,
`agent_record_symptoms`, `agent_write_visit_summary`, `auto_no_show_sweep`.

Gives non-repudiation: you can prove who accessed a civil ID or approved a
booking, and every AI write is recorded.

## 3. MFA (AAL2) required for sensitive actions

`private.require_aal2()` raises `mfa_required` unless the caller has an
MFA-verified session. Applied to:

- `admin_get_patient_civil_id` / `admin_set_patient_civil_id` (crown jewel)
- `approve_appointment` / `reject_appointment`
- `approve_slot_offer` / `reject_slot_offer`

**Operational note:** staff must enrol MFA (TOTP) or these return `mfa_required`.
To run approvals in a demo *before* enrolling MFA, remove the single
`perform private.require_aal2();` line from the approve/reject functions (keep it
on the civil-id functions). Agent writes are NOT MFA-gated (the agent has no
interactive session) — they are audit-logged instead.

## 4. Auto no-show + auto-expire (pg_cron)

Two jobs run every 15 minutes:
- `mediflow-auto-no-show` -> `auto_mark_no_shows()`: marks scheduled/confirmed
  appointments `no_show` when their start time (clinic tz `Asia/Muscat`) passed
  by > 30 minutes without check-in.
- `mediflow-expire-offers` -> `expire_stale_slot_offers()`: expires slot offers
  past 24h and cascades to the next candidate.

Change the timezone/grace in `auto_mark_no_shows` if the clinic differs.

## Prerequisites to make these fully live

- **Assign an `admin` role** to a user (none exists yet): civil-id access and
  admin dashboards need it.
  `update public.user_roles set role='admin' where user_id='<uuid>';`
- **Enrol MFA** for admin/reception (Authentication -> Multi-Factor is enabled;
  users must add an authenticator app).
- Frontend: show the data-use disclaimer -> call `record_consent('ai_data_use', ...)`.

## Verified (rolled back)

Consent recorded; approve blocked without MFA (`mfa_required`) and succeeds with
MFA; audit rows written for civil-id and approvals; past-due appointment
auto-marked `no_show`; both cron jobs active.
