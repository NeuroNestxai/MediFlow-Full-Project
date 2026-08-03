-- =============================================================================
-- MediFlow AI — Finish the account setup. ONE script, safe to re-run.
--
-- Run in Supabase → SQL Editor after creating staff accounts in
-- Authentication → Users.
--
-- IMPORTANT — why an earlier version of this script silently did nothing:
--
--   public.user_roles has PRIMARY KEY (user_id) — ONE role per person — and an
--   `on_auth_user_created` trigger already inserts a 'patient' row for every
--   new account, staff included. An INSERT ... ON CONFLICT DO NOTHING
--   therefore hit that existing row and discarded the real role without
--   complaining. Every statement below UPDATES the existing row instead.
--
--   One consequence to be aware of: because one person can hold only one role,
--   Dr. Nadia Al Hajri cannot be both clinician and administrator at the same
--   time. See the note at the end for how to change that properly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Confirm email addresses WITHOUT sending any email.
--    Supabase's built-in mail service is rate-limited and these mailboxes do
--    not receive mail anyway. Confirmation is only a timestamp — it is not
--    part of the password or identity data the auth service manages, so
--    setting it directly is safe. Real patients still confirm normally; this
--    covers the clinic's own @mccoman.com accounts only.
-- ---------------------------------------------------------------------------
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) like '%@mccoman.com'
   and email_confirmed_at is null;

-- ---------------------------------------------------------------------------
-- 2. Assign the real roles.
--
--    Accounts that do not exist yet are skipped, so this is safe to run before
--    all of them have been created.
--
--    TONIGHT'S ASSIGNMENT — read this:
--      nadia_alhajri     → doctor     (linked to Dr. Nadia Al Hajri)
--      jumana_almajrafi  → reception  (TEMPORARY — see below)
--      khawla_alhuti     → doctor
--      hayat_alkiyumi    → doctor
--      nasayim_alhajri   → reception
--
--    Jumana is listed by MCC as a doctor, but she has no record in the
--    MCC-confirmed directory of 11 clinicians, so a doctor account for her
--    cannot function. Making her reception means the demo has a working
--    administrator without needing another account created. To restore her as
--    a doctor later, change 'reception' to 'doctor' on her line below and add
--    her to the directory first.
-- ---------------------------------------------------------------------------
update public.user_roles ur
   set role = v.role::public.app_role,
       assigned_at = now()
  from auth.users u
  join (values
    ('nadia_alhajri@mccoman.com',    'doctor'),
    ('khawla_alhuti@mccoman.com',    'doctor'),
    ('hayat_alkiyumi@mccoman.com',   'doctor'),
    ('jumana_almajrafi@mccoman.com', 'reception'),
    ('nasayim_alhajri@mccoman.com',  'reception')
  ) as v(email, role) on lower(u.email) = v.email
 where ur.user_id = u.id;

-- Safety net: if the signup trigger did not fire for some account, there is no
-- row to update, so create it.
insert into public.user_roles (user_id, role)
select u.id, v.role::public.app_role
from auth.users u
join (values
  ('nadia_alhajri@mccoman.com',    'doctor'),
  ('khawla_alhuti@mccoman.com',    'doctor'),
  ('hayat_alkiyumi@mccoman.com',   'doctor'),
  ('jumana_almajrafi@mccoman.com', 'reception'),
  ('nasayim_alhajri@mccoman.com',  'reception')
) as v(email, role) on lower(u.email) = v.email
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Display names, so the app greets people properly rather than generically.
--    The signup trigger creates the profile row but leaves the name empty.
--    Only the clinic's own accounts are touched — a patient's self-entered
--    name is never overwritten.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, preferred_name)
select u.id, v.full_name, v.preferred
from auth.users u
join (values
  ('nadia_alhajri@mccoman.com',    'Dr. Nadia Al Hajri',    'Nadia'),
  ('khawla_alhuti@mccoman.com',    'Dr. Khawla Al Huti',    'Khawla'),
  ('hayat_alkiyumi@mccoman.com',   'Dr. Hayat Al Kiyumi',   'Hayat'),
  ('jumana_almajrafi@mccoman.com', 'Jumana Al Majrafi',     'Jumana'),
  ('nasayim_alhajri@mccoman.com',  'Nasayim Al Hajri',      'Nasayim'),
  ('demo.patient@mccoman.com',     'Maryam Al Farsi',       'Maryam')
) as v(email, full_name, preferred) on lower(u.email) = v.email
on conflict (id) do update
   set full_name      = excluded.full_name,
       preferred_name = excluded.preferred_name;

-- ---------------------------------------------------------------------------
-- 4. Link doctor logins to their directory records. Every doctor policy and
--    procedure resolves through this link; without it a doctor account can
--    see nothing.
--
--    Note the spelling differences between the email addresses and the
--    MCC-confirmed names — Al Huti / Al Hotti and Al Kiyumi / Al Koyoumi are
--    the same people.
-- ---------------------------------------------------------------------------
update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'nadia_alhajri@mccoman.com'  and d.slug = 'nadia-al-hajri';

update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'khawla_alhuti@mccoman.com'  and d.slug = 'khawla-al-hotti';

update public.doctors d set user_id = u.id from auth.users u
 where lower(u.email) = 'hayat_alkiyumi@mccoman.com' and d.slug = 'hayat-al-koyoumi';

-- Jumana is reception tonight, so make sure she is not left linked to a
-- doctor record by a previous run of this script.
update public.doctors d set user_id = null from auth.users u
 where lower(u.email) = 'jumana_almajrafi@mccoman.com' and d.user_id = u.id;

-- ---------------------------------------------------------------------------
-- 5. Report. Every account should show "can sign in" and the intended role.
-- ---------------------------------------------------------------------------
select lower(u.email)                          as account,
       case when u.email_confirmed_at is null
            then 'CANNOT SIGN IN'
            else 'can sign in' end              as status,
       coalesce(ur.role::text, 'NO ROLE')       as role,
       coalesce(d.full_name, '—')               as linked_doctor
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.doctors    d  on d.user_id  = u.id
 where lower(u.email) like '%@mccoman.com'
 order by 1;

-- =============================================================================
-- Expected, with the three accounts that exist right now:
--
--   demo.patient@mccoman.com       can sign in   patient     —
--   jumana_almajrafi@mccoman.com   can sign in   reception   —
--   nadia_alhajri@mccoman.com      can sign in   doctor      Dr. Nadia Al Hajri
--
-- That is a complete demo set: one patient, one receptionist, one doctor.
--
-- LATER — letting one person hold two roles properly:
--   The app already supports it (it will offer a "choose your area" screen).
--   The database does not, because user_roles is keyed by user_id alone. The
--   change is to key it by (user_id, role) instead:
--
--     alter table public.user_roles drop constraint user_roles_pkey;
--     alter table public.user_roles add  constraint user_roles_pkey
--       primary key (user_id, role);
--
--   If you do that, you MUST also delete the stray 'patient' rows the signup
--   trigger leaves on staff accounts:
--
--     delete from public.user_roles ur using auth.users u
--      where ur.user_id = u.id and ur.role = 'patient'
--        and lower(u.email) like '%@mccoman.com'
--        and lower(u.email) <> 'demo.patient@mccoman.com';
--
--   Otherwise every staff member also counts as a patient, and private
--   .is_patient() — which guards patient data and the booking procedures —
--   would return true for them. Do not make this change the night of a demo.
-- =============================================================================
