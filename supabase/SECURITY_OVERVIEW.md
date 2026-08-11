# MediFlow — Security & Privacy overview (consolidated, PDF-ready)

Companion to `SECURITY_HARDENING.md`, `N8N_DEVELOPER_HANDOFF.md`, and
`HUMAN_IN_THE_LOOP.md`. Includes the human-in-the-loop approval feature.

## Table 1 — Where to find everything in Supabase

| What it is | Name | Type | Where in the dashboard | HITL |
|---|---|---|---|---|
| Identity vault | `patients` | Table | Table Editor (public) | |
| Clinical / agent data | `patient_clinical` | Table | Table Editor (public) | |
| AI visit summaries | `visit_summaries` | Table | Table Editor (public) | |
| Email queue (Gmail) | `email_outbox` | Table | Table Editor (public) | |
| Appointments (+ approval/rejection columns) | `appointments` | Table | Table Editor (public) | new cols |
| Doctor screens (ID-only) | `dashboard_doctor_appointments`, `dashboard_doctor_patient_summary` | Views | Table Editor (public) | |
| Patient screen (+ status & reason) | `dashboard_patient_appointments` | View | Table Editor (public) | updated |
| Reception queue | `dashboard_reception_queue` | View | Table Editor (public) | |
| Admin screens | `dashboard_admin_appointments`, `dashboard_admin_pending_approvals` | Views | Table Editor (public) | |
| Approval queue (admin+reception) | `dashboard_pending_approvals` | View | Table Editor (public) | new |
| Agent's only windows | `agent.patient_clinical`, `agent.appointment_context` | Views | Table Editor -> switch schema to `agent` | |
| Approve appointment | `approve_appointment` | Function | Database -> Functions | updated |
| Reject appointment | `reject_appointment` | Function | Database -> Functions | new |
| Force-pending guard | `appointments_force_pending` | Trigger fn | Database -> Functions / Triggers | new |
| No-show (doctor / reception) | `doctor_mark_no_show`, `staff_update_queue_status` | Functions | Database -> Functions | defined |
| Cancellation waitlist offers | `slot_offers` (+ `appointments.wants_earlier`) | Table/col | Table Editor (public) | new |
| Waitlist functions | `patient_set_wants_earlier`, `respond_slot_offer`, `approve_slot_offer`, `reject_slot_offer`, `expire_stale_slot_offers`, `open_slot_offer_for_slot` | Functions | Database -> Functions | new |
| Waitlist views | `dashboard_my_slot_offers`, `dashboard_slot_offers_pending` | Views | Table Editor (public) | new |
| Civil-ID encrypt/decrypt (admin) | `admin_set_patient_civil_id`, `admin_get_patient_civil_id` | Functions | Database -> Functions | |
| Agent write functions | `agent.record_symptoms`, `agent.write_visit_summary` | Functions | Database -> Functions | |
| Status list (incl. pending_approval, rejected) | `appointment_status` | Enum type | Database -> Types / SQL editor | new values |
| Agent login role | `mediflow_agent` | Role | Database -> Roles | |
| Encryption key | `civil_id_encryption_key` | Vault secret | Project Settings -> Vault | |
| Access rules | RLS policies | Policies | Database -> Policies | |
| Full backup snapshot | `backup_20260811` (18 tables) | Schema | Table Editor -> switch schema | |

## Table 2 — Cyber-attacks protected against

| Attack | Scenario | Protection | HITL |
|---|---|---|---|
| AI/LLM data leak (prompt injection) | "List every patient's name" to the chatbot | Gemini never given names | |
| Stolen agent credential | AI DB password leaked | Only clinical-by-ID; no names/email/civil-ID | |
| Broken access control (IDOR) | Patient reads another's record | RLS returns only own rows | |
| SQL injection | Injected SQL via a form | Parameterized functions + RLS | |
| Stolen database / backup (at rest) | Whole DB copied | Civil IDs encrypted; passwords bcrypt | |
| Account takeover / credential stuffing | Reused leaked password | MFA + bcrypt + rate limits | |
| Privilege escalation | Doctor self-grants admin | Functions re-check role; role table locked | |
| Over-privileged insider | Doctor browses identities | Doctors are ID-only | |
| Anonymous scraping | Bot hits API without login | Anonymous = zero rows | |
| Fraudulent / auto-finalized bookings | Script/agent creates a pre-confirmed appointment | Force-pending trigger + no direct writes; only approve() finalizes | yes |
| Unauthorized approval | Patient/doctor approves their own | approve/reject gated to admin/reception | yes |
| Booking spam / abuse | Bot floods fake requests | Human review gate before finalize | yes |
| Repudiation | Dispute over who confirmed | approved_by/at + rejected_by/at/reason audit trail | yes |
| Queue-jumping / unfair slot grab | Patient tries to grab a freed slot they weren't offered | Offers only to opted-in candidates by priority; response gated to the named candidate; move needs admin approval; writes via functions only | yes |

## Table 3 — Advantages, disadvantages & solutions

| Area | Advantage | Disadvantage / limitation | How to solve |
|---|---|---|---|
| Data separation (vault/clinical/agent) | PII can't leak via AI or doctor views | More objects to maintain | Keep docs current; train devs |
| Encryption (civil ID) | Stolen DB reveals no civil IDs | Admin/service_role can decrypt | Enforce MFA on admin; rotate key; limit admins |
| Least-privilege agent role | Tiny blast radius if creds leak | Only real once n8n uses it | Switch n8n to `mediflow_agent` (priority #1) |
| RLS everywhere | Strong per-row protection | Slight query overhead | Already optimized; test on changes |
| MFA (TOTP) | Blocks account takeover | Enabled, not enforced | Require MFA for admin/staff |
| Passwords (bcrypt) | Industry standard | Leaked-password check needs Pro | Strong unique passwords; Pro later |
| Backups | Full manual snapshot exists | No auto PITR (Free) | Pro for PITR, or scheduled exports |
| Third-party AI (Gemini) | Only de-identified data sent | Health data still leaves to Google | Sign Google data terms; consider EU/self-host |
| Human-in-the-loop approval | No appointment finalized without a person; no fake/auto bookings; approve/reject audit trail; automatic email | Adds a manual step (slower + staff workload) | Reception can approve (done); add auto-approve rules / SLA reminders; optional pg_cron auto-no-show |
| No-show handling | Defined for doctor + reception; frees slot; notifies patient | Manual only | Optional pg_cron to auto-mark no-shows after N minutes |
| Cancellation waitlist | Fills freed slots automatically; opt-in + patient choice + admin approval + email; cascades on decline | Adds staff approval per move; offers expire in 24h | Schedule `expire_stale_slot_offers()` (n8n cron/pg_cron); tune priority rule if needed |
| Auditability | Approvals, rejections, status tracked | No "who viewed a patient" log | Add read-audit trigger on `patients` |
| Monitoring | Base Supabase logs | No alerting / pen-test | Alerts on failed logins; review before scaling |
