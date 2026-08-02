-- =============================================================================
-- Grant roles to the two staff logins and link the doctor account to a
-- doctor record. Run AFTER creating both users in Authentication → Users.
--
-- Safe to re-run: every statement is idempotent.
-- Edit the two emails below if you used different ones.
-- =============================================================================

-- The emails are written inline below (the Supabase SQL editor does not
-- support psql variables). If you used different addresses, replace every
-- occurrence of 'doctor@mediflowom.com' and 'reception@mediflowom.com'.

-- ---------------------------------------------------------------------------
-- 1. Roles. `user_roles` is what every policy and stored procedure reads —
--    never user metadata, which the user could edit themselves.
-- ---------------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select u.id, 'doctor'
from auth.users u
where u.email = 'doctor@mediflowom.com'
on conflict do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'reception'
from auth.users u
where u.email = 'reception@mediflowom.com'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Profile rows, so the app has a name to greet each account with.
--    (The signup trigger only fires for self-registration.)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, preferred_name)
select u.id, 'Dr. Abbas Pakkyara', 'Abbas'
from auth.users u
where u.email = 'doctor@mediflowom.com'
on conflict (id) do nothing;

insert into public.profiles (id, full_name, preferred_name)
select u.id, 'Salma Al Balushi', 'Salma'
from auth.users u
where u.email = 'reception@mediflowom.com'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Link the doctor login to a doctor record. Without this the account holds
--    the doctor role but resolves to no doctor, and every doctor screen and
--    procedure correctly refuses it.
--
--    Change 'abbas-pakkyara' to book against a different clinician. Valid
--    slugs: abbas-pakkyara, khawla-al-hotti, hayat-al-koyoumi, nadia-al-hajri,
--    samar-al-sinani, fatma-al-khoudr, fadi-mosa, magdi-ashria,
--    nawal-al-maskari, raya-al-hajri, siham
-- ---------------------------------------------------------------------------
update public.doctors d
   set user_id = u.id
  from auth.users u
 where u.email = 'doctor@mediflowom.com'
   and d.slug  = 'abbas-pakkyara';

-- ---------------------------------------------------------------------------
-- 4. Confirm what happened.
-- ---------------------------------------------------------------------------
select u.email,
       ur.role::text                       as granted_role,
       coalesce(d.full_name, '— not linked —') as linked_doctor
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.doctors    d  on d.user_id  = u.id
 where u.email in ('doctor@mediflowom.com', 'reception@mediflowom.com')
 order by u.email;
