# MediFlow — Cross-stack integration changes (what changes outside the database)

Everything below is what the **frontend, backend, n8n, Gemini, and Supabase
config** must do to use the hardened database. The DB side is done; this is the
"connect it up" checklist. Nothing here changes the database.

## A. Supabase configuration (dashboard / ops)
- [ ] **Enrol MFA (TOTP)** for the operator account (admin+reception). Required —
      civil-id access and all approvals now demand an MFA-verified (AAL2) session.
- [x] Assign the operator the `admin` role (done — admin == reception).
- [ ] **Set the agent role password:** `alter role mediflow_agent with login password '<secret>';`
- [ ] (Optional, Pro) leaked-password protection; point-in-time backups.
- [x] pg_cron jobs scheduled (auto no-show + offer expiry) — no action.

## B. Frontend (Vercel / Next.js)
Point every dashboard at its **view** and every write at its **RPC** (RLS makes
these safe with the user's JWT):

- [ ] **Dashboards -> views:** doctor -> `dashboard_doctor_appointments` +
      `dashboard_doctor_patient_summary` (ID-only, no name); patient ->
      `dashboard_patient_appointments`; reception -> `dashboard_reception_queue`;
      admin -> `dashboard_admin_appointments`; approvals -> `dashboard_pending_approvals`.
- [ ] **Booking:** now returns `pending_approval`; show an "Awaiting approval"
      state. Handle new errors: `too_many_pending_requests` (max 3 open),
      `slot_unavailable`, `mfa_required`.
- [ ] **Approve/Reject UI** (admin/reception): buttons -> `approve_appointment(id)` /
      `reject_appointment(id, reason)`. **Staff must sign in with MFA** or these
      return `mfa_required`.
- [ ] **Waitlist:** opt-in toggle -> `patient_set_wants_earlier(appt_id, bool)`;
      patient offer card from `dashboard_my_slot_offers` with Move-up/Keep ->
      `respond_slot_offer(offer_id, bool)`; staff queue `dashboard_slot_offers_pending`
      -> `approve_slot_offer` / `reject_slot_offer`.
- [ ] **Data-use disclaimer:** show the notice (see PRIVACY_NOTICE.md) and call
      `record_consent('ai_data_use','v1',true)` on accept.
- [ ] **Transparency page:** read `dashboard_my_ai_data` ("what the AI sees about me").
- [ ] **Civil ID (admin):** set/read via `admin_set_patient_civil_id` /
      `admin_get_patient_civil_id` (MFA session only).
- [ ] **Erasure (admin):** button -> `admin_delete_patient_data(user_id)` (MFA).
      Note: this anonymizes data; **full account deletion** = Supabase Auth admin
      API server-side (see C).
- [ ] **Notifications:** render new `patient_notifications` types
      (`appointment_requested/confirmed/rejected`, `slot_offer`, `slot_offer_rejected`).
- [ ] **MFA enrolment UI** for staff (Supabase MFA factors).

## C. Backend / API routes (if any server-side code)
- [ ] Use the **anon/authenticated** key with the user's JWT so RLS applies.
      Never expose `service_role` to the browser.
- [ ] **Full account deletion** (right-to-erasure, if required beyond anonymize):
      call the Supabase **Auth Admin API** (`auth.admin.deleteUser`) with
      `service_role` from the server, after `admin_delete_patient_data`.
- [ ] Read only through views/RPCs — no raw table access from server paths either.

## D. n8n
- [ ] **Agent DB connection -> role `mediflow_agent`** (NOT `service_role`). Its
      world is the `agent` schema only: read `agent.patient_clinical` /
      `agent.appointment_context`; write `agent.record_symptoms` /
      `agent.write_visit_summary`.
- [ ] **Gmail node (service_role):** poll `email_outbox` where `status='pending'`,
      send, mark `sent`. It now also sends: approval/rejection/confirmation/
      moved-earlier emails **and `security_alert` emails** (to safesightxai@gmail.com).
      Optionally branch on `template='security_alert'` to route alerts to a
      separate inbox/channel.
- [ ] (Optional) the pg_cron jobs already handle no-show + offer expiry; if you
      prefer n8n, call `auto_mark_no_shows()` / `expire_stale_slot_offers()` on a
      schedule instead.

## E. Gemini (the model / prompt)
- [ ] Prompt receives **only** `patient_id` + symptoms + clinical (from
      `agent.patient_clinical`). **No name/age/gender/email/civil_id** — ever.
      This replaces the old Excel staging.
- [ ] Write the visit summary back via `agent.write_visit_summary(reference, summary)`;
      it feeds the doctor's `dashboard_doctor_patient_summary`.
- [ ] Show the data-use disclaimer in the chat entry point.

## F. QR / check-in
- [x] Unchanged — QR still encodes only the booking `reference` (no PII). The
      agent and staff use the reference; check-in/out flows are as before.

## G. Security alerting (already wired in DB)
- Alerts for `civil_id_decrypt`, `civil_id_set`, `patient_data_erased` are queued
  to `safesightxai@gmail.com` via `email_outbox`. Delivery depends on the n8n
  Gmail node running. Change the recipient any time:
  `update public.app_settings set value='<email>' where key='security_alert_email';`
  (For instant push instead of email, add a `pg_net` webhook later.)

---
Pair with N8N_DEVELOPER_HANDOFF.md (agent detail) and SECURITY_HARDENING.md.
