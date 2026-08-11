# Security cutover — APPLIED

The change formerly staged here (`20260811_sec_09_enforce_doctor_no_pii.sql`)
has now been **applied to the live database** and captured as a normal migration:
`supabase/migrations/20260811161728_sec_09_enforce_doctor_no_pii.sql`.

Doctors can no longer read patient names/phone from `public.profiles`; they reach
patient data only through the ID-only dashboard views. The `.sql` file in this
folder is retained for reference and rollback only.

**Frontend follow-up:** point the doctor dashboard at
`public.dashboard_doctor_appointments` and
`public.dashboard_doctor_patient_summary` (both name-free). Until then the doctor
page shows a blank where the patient name used to be. Reception/admin/patient
dashboards are unaffected.

Rollback (re-open doctor access to profiles) is documented at the top of
`20260811_sec_09_enforce_doctor_no_pii.sql`.
