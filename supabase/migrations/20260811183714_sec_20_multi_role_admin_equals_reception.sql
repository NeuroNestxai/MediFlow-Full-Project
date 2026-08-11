-- =============================================================================
-- MediFlow AI — Admin == Reception (one operator holds both roles)
-- Migration: 20260811183714_sec_20_multi_role_admin_equals_reception  (IDEMPOTENT)
--
-- MediFlow is run by a single operator who is BOTH admin and reception. This
-- allows multiple roles per user (composite PK on user_roles) and grants the
-- reception operator the admin role too, so that account satisfies both
-- private.is_admin() and private.is_reception().
-- =============================================================================

begin;

-- 1. Allow multiple roles per user.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.user_roles'::regclass and contype = 'p';
  if c is not null then execute format('alter table public.user_roles drop constraint %I', c); end if;
end $$;
alter table public.user_roles add constraint user_roles_pkey primary key (user_id, role);

-- 2. Signup trigger conflict target -> (user_id, role).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.profiles (id, full_name, preferred_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''),
          new.raw_user_meta_data ->> 'preferred_name',
          coalesce(new.phone, new.raw_user_meta_data ->> 'phone'))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'patient')
  on conflict (user_id, role) do nothing;

  insert into public.patients (user_id, full_name, preferred_display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''),
          new.raw_user_meta_data ->> 'preferred_name', new.email)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. Audit helper: aggregate a user's (now possibly multiple) roles.
create or replace function private.log_audit(
  p_action text, p_target_type text default null, p_target_id text default null, p_details jsonb default null)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  insert into public.audit_log (actor_user_id, actor_role, action, target_type, target_id, details)
  values (auth.uid(),
          coalesce((select string_agg(ur.role::text, ',' order by ur.role::text)
                    from public.user_roles ur where ur.user_id = auth.uid()), 'system'),
          p_action, p_target_type, p_target_id, p_details);
exception when others then null;
end;
$$;
revoke all on function private.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- 4. Grant the reception operator the admin role too (same person).
insert into public.user_roles (user_id, role, assigned_by, assigned_at)
select user_id, 'admin'::public.app_role, user_id, now()
from public.user_roles where role = 'reception'
on conflict (user_id, role) do nothing;

commit;
