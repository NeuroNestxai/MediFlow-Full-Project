-- =============================================================================
-- MediFlow AI — Security hardening 09: enforce doctor "no PII" at the DB layer
-- Migration: 20260811161728_sec_09_enforce_doctor_no_pii  (IDEMPOTENT)
--
-- Closes the last legacy path: doctors can no longer read patient names/phone
-- from public.profiles. Reception keeps front-desk name access; doctors reach
-- patient data ONLY through the ID-only dashboard views.
--
-- Applied live 2026-08-11. The doctor dashboard frontend must read from
-- public.dashboard_doctor_appointments / dashboard_doctor_patient_summary
-- (which carry NO name) or it will show blank names until repointed.
--
-- ROLLBACK (re-open doctor access to profiles):
--   drop policy if exists profiles_select_staff on public.profiles;
--   create policy profiles_select_staff on public.profiles
--     for select to authenticated
--     using ( private.is_reception()
--             or (private.is_doctor() and private.doctor_has_patient(id)) );
-- =============================================================================

begin;

drop policy if exists profiles_select_staff on public.profiles;

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using ( private.is_reception() );

commit;
