# MediFlow — Incident response runbook (project-scoped)

A short IR plan for the MediFlow digital-transformation project. Covers detection,
triage, containment, recovery, and review for data/security incidents.

## Roles
- **Security owner / admin** (the operator) — decides and acts.
- **Support:** Supabase support (platform), n8n owner (automation), Vercel owner (app).

## Detection (how we find out)
- **Automatic email alerts** to `safesightxai@gmail.com` for high-risk actions
  (`civil_id_decrypt`, `civil_id_set`, `patient_data_erased`) via `email_outbox`.
- **Audit trail:** `public.audit_log` (admin-readable) records sensitive actions.
- **Platform logs:** Supabase Logs (auth, postgres, api), advisor warnings.

## Triage (classify severity)
- **High:** suspected PII/civil-id exposure, account takeover, data loss.
- **Medium:** repeated failed logins, misconfiguration, abnormal approvals.
- **Low:** single anomaly, transient error.

## Containment
- Suspected account takeover: in Supabase Auth, **revoke sessions / reset
  password** for the user; ensure MFA is enrolled.
- Suspected agent-credential leak: `alter role mediflow_agent with password '<new>';`
  (rotate) and update n8n.
- Suspected key exposure (civil-id): rotate the Vault key and re-encrypt (planned
  procedure) — treat as high severity.
- Stop the offending workflow (n8n) if it is the vector.

## Investigation
- Query `audit_log` for the actor, action, target, and time.
- Cross-check Supabase auth logs for the session.
- Determine scope: which patients/records were affected.

## Recovery
- Restore data if needed from the snapshot (`backup_20260811`) or Supabase backups.
- Re-enable services; verify RLS/roles intact (`get_advisors`).

## Notify
- Inform affected patients and the MOH/regulator as required by PDPL/health rules
  (org decision).

## Review
- Record the incident, root cause, and fix. Add a control if a gap is found.

## Contacts / references
- Alert inbox: `safesightxai@gmail.com` (change via `app_settings.security_alert_email`).
- Audit data: `select * from public.audit_log order by occurred_at desc;`
- Docs: SECURITY_HARDENING.md, GOVERNANCE_HARDENING.md.
