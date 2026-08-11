# MediFlow — Secure architecture note (project-scoped)

How the MediFlow digital-transformation project is built securely, and the
shared-responsibility split with the managed platform.

## Components & trust boundaries

```
Patient / Staff browser ─(HTTPS/TLS)─► Vercel (Next.js frontend)
        │  Supabase JS (user JWT, anon/authenticated key)
        ▼
Supabase PostgREST / Postgres 17 (managed, encrypted at rest, region ap-northeast-1)
   • RLS on every table (deny-by-default, no anonymous access)
   • Writes only through SECURITY DEFINER RPCs (search_path pinned)
   • Identity vault (encrypted civil_id via pgcrypto + Vault key)
   • Audit log + MFA (AAL2) gate on sensitive actions
        │                         ▲
        │ agent schema only        │ email_outbox (service_role)
        ▼                         │
n8n:  Gemini agent  ── role mediflow_agent (least privilege, no PII)
      Gmail node    ── service_role (sends queued emails + security alerts)
        │
        ▼
Google Gemini API — receives pseudonymous ID + symptoms only (no identity PII)
```

## Security properties by design
- **Least privilege:** a dedicated `mediflow_agent` role whose only surface is the
  `agent` schema; the browser uses `authenticated` with per-user RLS.
- **Data minimization:** the AI receives only `patient_id` + clinical/symptoms.
- **Encryption:** TLS in transit; Supabase at-rest encryption; civil_id
  application-encrypted (pgcrypto) with a key held in Supabase Vault.
- **Human-in-the-loop:** no appointment is finalized without staff approval.
- **Defense in depth:** RLS + column grants + definer RPCs + MFA + audit.
- **Auditability:** every sensitive action is logged; high-risk ones alert.
- **Change control:** all schema changes are version-controlled migrations,
  tested (rolled-back E2E) before/at apply, and advisor-checked.

## Shared responsibility
| Layer | Secured by |
|---|---|
| Physical, host, DB engine patching, at-rest encryption, backups, HA | **Supabase (managed)** |
| Schema, RLS, roles, encryption of civil_id, RPCs, audit, MFA gating | **MediFlow project (this repo)** |
| App session handling, showing disclaimer, calling the right RPCs | **Frontend (Vercel)** |
| Agent connection (restricted role), email delivery | **n8n** |
| Prompt hygiene (no PII), model usage terms | **Gemini integration** |

## Residual risks (tracked in CEAE_AWARD_MAPPING.md risk register)
Agent must use the restricted role (not service_role); admin/service_role can
decrypt civil_id by design; third-party data terms (DPAs) are an org action;
alerting depends on the n8n Gmail node running.
