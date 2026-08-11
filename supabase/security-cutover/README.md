# Security cutover (run manually, at frontend release time)

This folder holds the **one** DB change that is intentionally *not* an
auto-applied migration, because it takes effect immediately and requires the
Vercel frontend to be deployed first.

## `20260811_sec_09_enforce_doctor_no_pii.sql`

Closes the doctor-dashboard name leak at the database layer by removing doctors'
read access to `public.profiles`. Doctors then reach patient data **only**
through the ID-only views.

### Order of operations
1. Deploy the frontend so the **doctor** dashboard reads from
   `public.dashboard_doctor_appointments` and
   `public.dashboard_doctor_patient_summary` (never `profiles`/`patients`).
2. Run `20260811_sec_09_enforce_doctor_no_pii.sql` in the Supabase SQL Editor.
3. Verify: doctors no longer see any patient name anywhere.

Until step 2 is run, the ID-only views are already live and safe to use; the
only thing still open is doctors' legacy direct read of `profiles`.
