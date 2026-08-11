# MediFlow — Oman MOH Cybersecurity Excellence Award (CEAE): control mapping

**Award participation category: "Best Secure Digital Transformation Project"
(أفضل مشروع تحول رقمي آمن).**

Maps the MediFlow **secure digital transformation** to the award's 8 weighted
domains + 13 control areas, with an honest maturity read and the gaps. Reference
framework aligned to common practice (ISO/IEC 27001, national cybersecurity
controls). The Oman CDC library (cdc.gov.om) is the authoritative national
reference — pull the current control documents from there for the final submission.

> Scope note: because the category judges **the project**, not the whole clinic,
> the unit of evaluation is MediFlow itself — how securely it was designed, built
> and transformed. That makes the database/application security work the **core
> evidence**, and lets the Infrastructure and Awareness domains count the
> **project's** secure architecture and privacy-by-design (not the clinic's
> building/network). A few items (formal IR runbook, BC/DR, independent test,
> DPAs) are still worth having as project evidence — noted below.

## Why this category fits MediFlow

"Best Secure Digital Transformation Project" is almost a description of this work:
a patient-facing digital + AI transformation rebuilt **security-first** —
privacy-by-design (no PII to the LLM), encryption of sensitive data, least-
privilege AI-agent isolation, human-in-the-loop safeguards, full RLS, MFA-gated
sensitive actions, and an audit trail. That is a strong, on-theme narrative.

## 1. Award domains (8, weighted) - evidence & maturity

Assessed for **the MediFlow project** (not the whole clinic):

| # | Domain (weight) | Project evidence | Project maturity | Gap to close |
|---|---|---|---|---|
| 1 | **Identity & Access Mgmt (10%)** | RBAC (`user_roles` + `private.is_*`), RLS on every table (deny-by-default, no anon), least-privilege agent role, MFA (TOTP) + **AAL2 required** for civil-id + approvals | **Excellence** | Document the role model; enrol MFA for the operator |
| 2 | **Data Protection & Privacy (15%)** | civil_id encrypted (pgcrypto + Vault), PII isolation (identity vault), agent sees no PII, doctor ID-only, column lockdown, **consent record**, TLS + at-rest encryption (Supabase), snapshot backup | **Excellence** | DPAs (Google/Supabase), retention/erasure, PDPL note |
| 3 | **Infrastructure & Systems (20%)** | Project on managed, encrypted Postgres (Supabase, auto-patched), secure architecture (schema isolation, API boundary via RLS), advisor-clean, migration-controlled change | **Mature** | Document the secure architecture + shared-responsibility model; add FK-index polish |
| 4 | **Governance & Policy (15%)** | Audit trail, documented security design (repo docs), role model, human-in-the-loop approval, change control via migrations | **Mature** | A short project security policy + risk register (this doc) |
| 5 | **Innovation & Continuous Improvement (5%)** | Privacy-by-design, least-privilege AI-agent boundary, human-in-the-loop, cancellation-waitlist automation, audit + MFA gating; advisor-driven iteration | **Excellence** | Keep measuring improvements |
| 6 | **Compliance & Assurance (10%)** | Advisor findings addressed, audit_log evidence, tested (rolled-back E2E) migrations | **Mature** | Regulatory mapping (PDPL/MOH), independent test/pen-test |
| 7 | **Awareness & Training (10%)** | Data-use disclaimer/consent record, **privacy notice** (PRIVACY_NOTICE.md), **AI-data transparency view**, secure-by-design build practices | **Mature** | Frontend to display the notice/transparency page |
| 8 | **Monitoring & Incident Response (15%)** | `audit_log` + **email alerting on high-risk actions** + **IR runbook** (INCIDENT_RESPONSE.md) + Supabase logs | **Mature** | Wire n8n Gmail node so alerts deliver; optional SIEM |

**Honest read (project scope):** strong-to-excellent on the data-centric and
identity domains (1, 2, 5), and Mature across infrastructure, governance,
compliance, **awareness, and monitoring/IR** (3, 4, 6, 7, 8) — the last two were
lifted from *Developing* by adding a privacy notice + AI-data transparency view
(awareness) and email alerting on high-risk actions + an IR runbook (monitoring).
The remaining lifts are mostly **frontend display** (show the disclaimer /
transparency page) and **wiring** (n8n Gmail so alerts deliver). Realistic overall
**project maturity: solid Mature (75-89), trending to Excellence** once wired.
A credible, on-theme submission for the "Secure Digital Transformation Project".

## 2. The 13 control areas - coverage

| Control area | MediFlow coverage | Status |
|---|---|---|
| Governance | Documented design, role model, change control (migrations), audit trail | Partial (needs written policies) |
| Personal data protection | Encryption, PII isolation, minimization, consent, RLS | Strong |
| Identity & access management | RBAC, RLS, least privilege, MFA + AAL2 gating | Strong |
| Vulnerability management | Supabase security advisor run + findings fixed | Partial (add periodic scans/pen-test) |
| Patch management | Managed Postgres auto-patched by Supabase | Covered (managed) |
| Backup & recovery | In-DB snapshot (locked); Supabase managed backups | Partial (PITR needs Pro; test restores) |
| Incident response | audit_log as evidence source | Partial (need IR plan + alerting) |
| Business continuity | Managed HA platform | Partial (need BC/DR plan) |
| Cloud hosting | Supabase (managed, encrypted, region ap-northeast-1) | Covered (document shared-responsibility) |
| Network security | RLS/API boundary; Supabase network controls | Partial (org network out of scope) |
| Third parties | Data minimization to Gemini (no PII); managed providers | Partial (sign DPAs) |
| Security awareness | Data-use disclaimer/consent | Minimal (org training) |
| Compliance | Advisor assurance + audit | Partial (regulatory mapping) |

## 3. MediFlow risk register (database/application)

Likelihood/impact are indicative; controls listed are IMPLEMENTED unless noted.

| # | Asset / system | Threat | Risk scenario | Likelihood | Impact | Level | Controls in place |
|---|---|---|---|---|---|---|---|
| 1 | Patient database (Supabase) | SQL injection / data exposure | Attacker extracts PII | Low | High | Medium | Parameterized `SECURITY DEFINER` RPCs, no dynamic SQL, RLS deny-by-default, least-privilege roles |
| 2 | AI agent (n8n/Gemini) | PII leak to LLM / prompt injection | Agent reveals names | Low* | High | Medium | Dedicated `mediflow_agent` role, `agent` schema only (no PII), audit logging. *Low **once n8n uses the role, not service_role** |
| 3 | Civil ID / sensitive PII | Data-at-rest breach | DB dump reveals civil IDs | Low | High | Medium | pgcrypto + Vault key, column lockdown, MFA-gated decrypt, audit |
| 4 | Staff/admin account | Account takeover / credential stuffing | Attacker approves/reads PII | Medium | High | Medium | MFA (TOTP) + AAL2 gating, bcrypt, rate limits, RBAC |
| 5 | Appointment integrity | Fraudulent / auto-finalized bookings | Fake or unapproved appointments | Medium | Medium | Medium | Human-in-the-loop approval, force-pending, audit trail |
| 6 | Patient portal / API (PostgREST) | Broken access control / IDOR | Cross-patient data access | Medium | High | Medium | RLS row-scoping, role-scoped views, deny-by-default |
| 7 | Email queue (outbox) | PII leak via queue | Exposure of recipient emails | Low | Medium | Low | RLS: service-role only; minimal PII in body |
| 8 | Backups | Unauthorized restore / exposure | Backup PII exposed | Low | Medium | Low | Snapshot access-locked; managed backups (PITR = Pro) |
| 9 | Third parties (Supabase/Gemini/Vercel/n8n) | Supply-chain / processor risk | Third party mishandles data | Medium | Medium | Medium | Data minimization to Gemini (no PII), managed providers; DPAs = org action |
| 10 | Availability / continuity | Outage / data loss | Clinic cannot operate | Low-Med | High | Medium | Managed HA, version-controlled migrations; formal BC/DR = org |
| 11 | Monitoring | Undetected malicious action | Breach goes unnoticed | Medium | Medium | Medium | `audit_log` of sensitive actions; SIEM/alerting = to build |
| 12 | Insider misuse | Staff snoops PII | Privacy violation | Medium | High | Medium | RLS, MFA-gated civil_id, audit trail (non-repudiation), doctor ID-only |

## 4. Database gaps - status

| Gap | Action (DB) | Domain helped | Status |
|---|---|---|---|
| Data retention / erasure | `admin_delete_patient_data(user_id)` (anonymize PII, keep audit) | Data protection, Compliance | DONE (sec_24) |
| Booking abuse | Cap open pending requests per patient (max 3) | IAM/robustness | DONE (sec_22) |
| Detection / alerting | High-risk audited actions email an alert (`app_settings` recipient) | Monitoring & IR | DONE (sec_23) |
| Transparency | `dashboard_my_ai_data` ("what the AI receives about me") | Data protection, Awareness | DONE (sec_24) |
| Advisor polish | FK covering indexes | Infrastructure/assurance | DONE (sec_21) |
| Backup assurance | Documented + tested restore drill from the snapshot | Backup & recovery | TODO (ops) |
| Instant push alerts | `pg_net` webhook (in addition to email) | Monitoring & IR | Optional |

## 5. Project evidence still worth preparing (lightweight, project-scoped)

For a **project** submission these are documents about MediFlow, not a clinic-wide
program — most are a page or two:

- A short **project security policy** + this **risk register**.
- A **secure architecture diagram** + shared-responsibility note (what Supabase
  secures vs what the project configures).
- A **project incident-response runbook** (who does what if MediFlow data is
  breached; how the `audit_log` is used).
- A **backup/restore drill** note (restore tested from the snapshot).
- **Data-processing agreements** with Supabase, Google (Gemini) and Vercel, and a
  short **PDPL/MOH** alignment note.
- A **user privacy notice** (the data-use disclaimer text) + a brief
  **secure-development** summary (privacy-by-design, code review, migrations).
- Optional but strong: an **independent review / penetration test** of the project.

---

Prepared as evidence for the CEAE submission's "supporting documentation". Pair it
with the other repo docs (SECURITY_HARDENING, GOVERNANCE_HARDENING,
HUMAN_IN_THE_LOOP, CANCELLATION_WAITLIST, N8N_DEVELOPER_HANDOFF, SECURITY_OVERVIEW).
