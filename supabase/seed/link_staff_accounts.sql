-- =============================================================================
-- MediFlow AI — Grant staff roles and link doctor accounts to doctor records.
--
-- Run AFTER creating the accounts in Supabase → Authentication → Users
-- (tick "Auto Confirm User", or they cannot sign in).
--
-- Safe to re-run: every statement is idempotent.
--
-- Roles per MCC:
--   Doctors  : Nadia Al Hajri · Khawla Al Huti · Hayat Al Kiyumi · Jumana Al Majrafi
--   Admin    : Nasayim Al Hajri · Nadia Al Hajri
--   Dr. Nadia Al Hajri holds BOTH roles — the app supports this and will ask
--   her which area she wants after sign-in.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles. `user_roles` is what every policy and stored procedure reads —
--    never user metadata, which the user could edit themselves.
--    `reception` is the app's name for the Admin role.
-- ---------------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select u.id, v.role::public.app_role
from auth.users u
join (values
  ('nadia_alhajri@mccoman.com',    'doctor'),
  ('khawla_alhuti@mccoman.com',    'doctor'),
  ('hayat_alkiyumi@mccoman.com',   'doctor'),
  ('jumana_almajrafi@mccoman.com', 'doctor'),
  ('nasayim_alhajri@mccoman.com',  'reception'),
  ('nadia_alhajri@mccoman.com',    'reception')
) as v(email, role) on lower(u.email) = v.email
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Profile rows, so the app has a name to greet each account with.
--    (The signup trigger only fires for patient self-registration.)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, preferred_name)
select u.id, v.full_name, v.preferred
from auth.users u
join (values
  ('nadia_alhajri@mccoman.com',    'Dr. Nadia Al Hajri',    'Nadia'),
  ('khawla_alhuti@mccoman.com',    'Dr. Khawla Al Huti',    'Khawla'),
  ('hayat_alkiyumi@mccoman.com',   'Dr. Hayat Al Kiyumi',   'Hayat'),
  ('jumana_almajrafi@mccoman.com', 'Dr. Jumana Al Majrafi', 'Jumana'),
  ('nasayim_alhajri@mccoman.com',  'Nasayim Al Hajri',      'Nasayim')
) as v(email, full_name, preferred) on lower(u.email) = v.email
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Link each doctor login to its directory record.
--
--    Matched on the existing seeded slugs. Note the spelling differences
--    between the email addresses and the MCC-confirmed directory names —
--    Al Huti / Al Hotti and Al Kiyumi / Al Koyoumi are the same people.
--
--    Jumana Al Majrafi is NOT in the MCC-confirmed list of 11 doctors, so she
--    has no directory record to link to and is intentionally absent below.
--    Until that is resolved her account will hold the doctor role but reach
--    the permission-denied screen — which is the safe way to fail. See the
--    note at the bottom of this file.
-- ---------------------------------------------------------------------------
update public.doctors d
   set user_id = u.id
  from auth.users u
 where lower(u.email) = 'nadia_alhajri@mccoman.com'
   and d.slug = 'nadia-al-hajri';

update public.doctors d
   set user_id = u.id
  from auth.users u
 where lower(u.email) = 'khawla_alhuti@mccoman.com'
   and d.slug = 'khawla-al-hotti';

update public.doctors d
   set user_id = u.id
  from auth.users u
 where lower(u.email) = 'hayat_alkiyumi@mccoman.com'
   and d.slug = 'hayat-al-koyoumi';

-- ---------------------------------------------------------------------------
-- 4. Confirm what happened. Check this output before moving on.
-- ---------------------------------------------------------------------------
select u.email,
       coalesce(string_agg(distinct ur.role::text, ' + ' order by ur.role::text), '— none —') as roles,
       coalesce(max(d.full_name), '— not linked —')                                          as linked_doctor
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.doctors    d  on d.user_id  = u.id
 where lower(u.email) like '%@mccoman.com'
 group by u.email
 order by u.email;

-- =============================================================================
-- Expected output
--
--   hayat_alkiyumi@mccoman.com    doctor              Dr. Hayat Al Koyoumi
--   jumana_almajrafi@mccoman.com  doctor              — not linked —
--   khawla_alhuti@mccoman.com     doctor              Dr. Khawla Al Hotti
--   nadia_alhajri@mccoman.com     doctor + reception  Dr. Nadia Al Hajri
--   nasayim_alhajri@mccoman.com   reception           — not linked —
--
-- `— not linked —` is correct for Nasayim: reception staff are not clinicians
-- and have no directory record.
--
-- TO RESOLVE — Dr. Jumana Al Majrafi:
-- She does not appear in the MCC-confirmed doctor list (9 specialties,
-- 48 services, 11 doctors) that the directory was seeded from. Either:
--   (a) confirm her specialty and services with MCC and add her in a new
--       migration, or
--   (b) use one of the three linked accounts for the demo.
-- Do NOT add her by re-running 20260802000002, whose final assertion checks
-- for exactly 11 doctors and would roll the whole migration back.
-- =============================================================================
