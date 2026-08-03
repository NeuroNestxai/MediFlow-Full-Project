-- =============================================================================
-- MediFlow AI — Finish the account setup. ONE script, safe to re-run.
--
-- Run this in Supabase → SQL Editor AFTER creating the staff accounts in
-- Authentication → Users (tick "Auto Confirm User").
--
-- It does four things:
--   1. Confirms the @mccoman.com addresses so they can sign in
--   2. Makes sure the demo patient has a patient role and a profile
--   3. Grants the staff roles and links doctors to their directory records
--   4. Prints a report so you can see exactly what worked
--
-- Nothing is deleted and nothing outside these accounts is touched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Confirm email addresses WITHOUT sending any email.
--
--    Supabase's built-in mail service is rate-limited, and these mailboxes
--    (demo.patient@ in particular) do not receive mail anyway. Confirmation is
--    just a timestamp on the account — it is NOT part of the password or
--    identity data that Supabase's auth service manages, so setting it here is
--    safe. Real patients still confirm their own address normally; this only
--    covers the clinic's own @mccoman.com accounts.
-- ---------------------------------------------------------------------------
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) like '%@mccoman.com'
   and email_confirmed_at is null;

-- ---------------------------------------------------------------------------
-- 2. Demo patient safety net.
--    Patient sign-up normally creates the profile and role via a trigger. If
--    that did not fire, fill the gaps so the demo account is usable.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, preferred_name)
select u.id, 'Maryam Al Farsi', 'Maryam'
from auth.users u
where lower(u.email) = 'demo.patient@mccoman.com'
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'patient'::public.app_role
from auth.users u
where lower(u.email) = 'demo.patient@mccoman.com'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Staff roles. `user_roles` is what every security policy and stored
--    procedure reads — never user metadata, which a user could edit.
--    `reception` is the app's internal name for the Admin role.
--    Accounts you have not created yet are simply skipped.
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
-- 4. Link doctor logins to their directory records.
--    Note the spelling differences between the email addresses and the
--    MCC-confirmed directory names — Al Huti / Al Hotti and Al Kiyumi /
--    Al Koyoumi are the same people.
--    Dr. Jumana Al Majrafi has no MCC-confirmed record, so she is absent here
--    on purpose. Her account will reach permission-denied until that is
--    resolved, which is the safe way to fail.
-- ---------------------------------------------------------------------------
update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'nadia_alhajri@mccoman.com'  and d.slug = 'nadia-al-hajri';

update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'khawla_alhuti@mccoman.com'  and d.slug = 'khawla-al-hotti';

update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'hayat_alkiyumi@mccoman.com' and d.slug = 'hayat-al-koyoumi';

-- ---------------------------------------------------------------------------
-- 5. Report. Every account should read "can sign in" and have a role.
-- ---------------------------------------------------------------------------
select lower(u.email)                                    as account,
       case when u.email_confirmed_at is null
            then 'CANNOT SIGN IN — not confirmed'
            else 'can sign in' end                       as status,
       coalesce(string_agg(distinct ur.role::text, ' + ' order by ur.role::text),
                'NO ROLE — will be denied access')       as roles,
       coalesce(max(d.full_name), '—')                   as linked_doctor
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.doctors    d  on d.user_id  = u.id
 where lower(u.email) like '%@mccoman.com'
 group by lower(u.email), u.email_confirmed_at
 order by 1;
