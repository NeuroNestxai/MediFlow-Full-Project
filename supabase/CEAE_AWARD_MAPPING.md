# MediFlow — Oman MOH Cybersecurity Excellence Award (CEAE): control mapping

Maps MediFlow's implemented **database/application security** to the award's
evaluation domains, with an honest maturity read and the gaps. Reference
framework: the award's 8 weighted domains + the 13 control areas, aligned to
common practice (ISO/IEC 27001, national cybersecurity controls). The Oman CDC
library (cdc.gov.om) is the authoritative national reference — pull the current
control documents from there when preparing the final submission.

> Scope note: this project is the **Supabase database + application layer**. Much
> of the award (physical/network infrastructure, endpoint, awareness training,
> formal incident-response and business-continuity programs) is **institution-level**
> and owned by the clinic, not the database. This document is honest about that
> split so the evidence you submit is credible.

## 1. Award domains (8, weighted) - evidence & maturity

| # | Domain (weight) | What MediFlow provides as evidence | DB maturity | Owner of remaining gap |
|---|---|---|---|---|
| 1 | **Identity & Access Mgmt (10%)** | RBAC (`user_roles` + `private.is_*`), RLS on every table (deny-by-default, no anon), least-privilege agent role, MFA (TOTP) + **AAL2 required** for civil-id + approvals | **Mature - Excellence** | Org: staff joiner/mover/leaver process, privileged-access mgmt across infra |
| 2 | **Data Protection & Privacy (15%)** | civil_id encrypted (pgcrypto + Vault), PII isolation (identity vault), agent sees no PII, doctor ID-only, column lockdown, **consent record**, TLS in transit + at-rest encryption (Supabase), data snapshot backup | **Mature - Excellence** | Org: signed DPAs (Google/Supabase), data-retention & erasure policy, PDPL alignment |
| 3 | **Infrastructure & Systems (20%)** | Managed Postgres (Supabase auto-patched), advisor-clean config, migration-controlled changes | **Partial** | Org/infra: clinic network, servers, medical devices, patching program |
| 4 | **Governance & Policy (15%)** | Technical governance: audit trail, documented security design (this repo's docs), role model, human-in-the-loop approval, change control via migrations | **Partial** | Org: written policies, risk-management program, defined roles/responsibilities |
| 5 | **Innovation & Continuous Improvement (5%)** | Privacy-by-design, least-privilege AI agent boundary, human-in-the-loop, cancellation-waitlist automation, audit + MFA gating; continuous fixing via advisor + migrations | **Mature** | Keep iterating; measure improvements |
| 6 | **Compliance & Assurance (10%)** | Advisor findings addressed (assurance), audit_log evidence, tested (rolled-back E2E) migrations | **Partial** | Org: regulatory mapping (PDPL/MOH), independent assessment/pen-test |
| 7 | **Awareness & Training (10%)** | Data-use disclaimer/consent (patient-facing awareness) | **Minimal** | Org: staff training, phishing simulations, measured impact |
| 8 | **Monitoring & Incident Response (15%)** | `audit_log` of sensitive actions + Supabase logs (the data source) | **Partial** | Org: SIEM/SOC, alerting, incident-response plan & playbooks |

**Honest read:** our work is strong evidence for **domains 1 & 2** (25% of the score),
meaningful partial evidence for **4, 5, 6, 8** (45%), and little for **3 & 7** (30%,
infrastructure + training). A realistic **DB-layer** maturity is **Mature (75-89)**;
overall institution maturity depends on the org-level domains the clinic must cover.

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

## 4. Gaps we can close in the database (to raise maturity)

| Gap | Action (DB) | Domain helped |
|---|---|---|
| Data retention / erasure | `admin_delete_patient_data(user_id)` (anonymize PII, keep audit) | Data protection, Compliance |
| Booking abuse | Cap open pending requests per patient | IAM/robustness |
| Detection | Alerting hook on high-risk audit actions (e.g. civil_id_decrypt) via `pg_net`/webhook | Monitoring & IR |
| Transparency | Patient view "what the AI receives about me" | Data protection, Awareness |
| Backup assurance | Documented + tested restore drill from the snapshot | Backup & recovery |
| Advisor polish | Add FK indexes, consolidate duplicate RLS policies | Infrastructure/assurance |

## 5. Owned by the clinic (org/infra - not the database)

Written security policies; risk-management program; network security & segmentation;
endpoint/medical-device security; patching program for non-Supabase systems;
SIEM/SOC + alerting + incident-response plan & playbooks; business-continuity/DR
plan with tested restores; staff awareness training + phishing simulations;
independent assessment / penetration test; signed data-processing agreements with
Supabase, Google (Gemini) and Vercel; PDPL/MOH regulatory mapping.

---

Prepared as evidence for the CEAE submission's "supporting documentation". Pair it
with the other repo docs (SECURITY_HARDENING, GOVERNANCE_HARDENING,
HUMAN_IN_THE_LOOP, CANCELLATION_WAITLIST, N8N_DEVELOPER_HANDOFF, SECURITY_OVERVIEW).
