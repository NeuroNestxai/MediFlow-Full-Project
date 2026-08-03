-- =============================================================================
-- Read-only diagnostic. Changes nothing.
--
-- `public.user_roles` and `public.profiles` were created in the Supabase
-- dashboard rather than by a migration in this repo, so their exact shape is
-- not recorded anywhere here. This prints it, so the role fix can be written
-- against the real table instead of an assumption.
-- =============================================================================

-- 1. Columns of user_roles
select 'COLUMN' as kind,
       column_name  as name,
       udt_name     as type,
       is_nullable  as nullable,
       ''           as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'user_roles'

union all

-- 2. Constraints — this is the important one. A primary key or unique
--    constraint on (user_id) ALONE means one role per user; on
--    (user_id, role) means a user may hold several.
select 'CONSTRAINT',
       conname,
       contype::text,
       '',
       pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.user_roles'::regclass

union all

-- 3. Indexes
select 'INDEX', indexname, '', '', indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'user_roles'

union all

-- 4. Allowed role values, if the column is an enum
select 'ROLE VALUE', e.enumlabel, t.typname, '', ''
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname in (
  select udt_name from information_schema.columns
  where table_schema = 'public' and table_name = 'user_roles' and column_name = 'role'
)

union all

-- 5. Triggers on auth.users — this is what auto-assigned 'patient' to
--    everybody, including the staff accounts.
select 'SIGNUP TRIGGER', tgname, '', '', pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal

order by 1, 2;

-- 6. What each MCC account actually holds right now.
select lower(u.email) as account,
       ur.role::text  as role
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
 where lower(u.email) like '%@mccoman.com'
 order by 1, 2;
