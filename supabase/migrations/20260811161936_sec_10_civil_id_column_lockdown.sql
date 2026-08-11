-- =============================================================================
-- MediFlow AI — Security hardening 10: true column-level lockdown of civil_id
-- Migration: 20260811161936_sec_10_civil_id_column_lockdown  (IDEMPOTENT)
--
-- PostgreSQL gotcha: a table-level SELECT grant (Supabase's default for
-- `authenticated`) overrides a column-level REVOKE, so the earlier
-- `revoke select (civil_id_encrypted)` in sec_03 was a no-op — the ciphertext
-- was still selectable. Fix it correctly: drop the table-wide SELECT and
-- re-grant SELECT on every column EXCEPT civil_id_encrypted. The encrypted
-- civil_id is then reachable ONLY through admin_get_patient_civil_id().
-- =============================================================================

begin;

revoke select on public.patients from anon;
revoke select on public.patients from authenticated;

grant select (patient_id, user_id, full_name, preferred_display_name,
              age, gender, email, created_at, updated_at)
  on public.patients to authenticated;

commit;
