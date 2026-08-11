-- =============================================================================
-- MediFlow AI — Security cutover 09: enforce doctor "no PII" at the DB layer
--
-- ⚠️  DO NOT put this file in supabase/migrations/ and DO NOT run it until the
--     doctor dashboard frontend has been repointed to the ID-only views
--     (public.dashboard_doctor_appointments / dashboard_doctor_patient_summary).
--
-- WHAT IT DOES
--   Removes the doctor branch from the profiles staff-read policy, so doctors
--   can no longer read patient names/phone from public.profiles at all. This is
--   the final step that closes the "AI-Organized Patient Summary shows the
--   patient's first name" leak at the database level (not just the UI).
--
-- WHY IT IS SEPARATE
--   The current live doctor dashboard reads public.profiles directly. Applying
--   this before the frontend switches to the new views would make the doctor
--   dashboard stop returning patient rows. Deploy the frontend first, then run
--   this in the same release window.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → paste → Run  (or psql as the postgres role)
--
-- ROLLBACK (re-open doctor access to profiles, if you must):
--   drop policy if exists profiles_select_staff on public.profiles;
--   create policy profiles_select_staff on public.profiles
--     for select to authenticated
--     using ( private.is_reception()
--             or (private.is_doctor() and private.doctor_has_patient(id)) );
-- =============================================================================

begin;

drop policy if exists profiles_select_staff on public.profiles;

-- Reception keeps front-desk name access; doctors no longer get any profile PII.
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using ( private.is_reception() );

commit;

-- After running, re-verify with:
--   select policyname, qual from pg_policies
--   where schemaname='public' and tablename='profiles';
-- Doctors should now only reach patient data through the ID-only dashboard views.
