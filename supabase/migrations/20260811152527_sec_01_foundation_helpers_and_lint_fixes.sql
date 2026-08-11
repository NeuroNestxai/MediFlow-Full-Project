-- =============================================================================
-- MediFlow AI — Security hardening 01: role helpers + advisor lint fixes
-- Migration: 20260811152527_sec_01_foundation_helpers_and_lint_fixes
--            (ADDITIVE, IDEMPOTENT, NON-BREAKING)
--
-- Part of the PII-isolation hardening. Adds an admin/any-staff role helper
-- (mirroring the existing private.is_doctor/reception/patient), pins the one
-- function missing a stable search_path, and revokes EXECUTE on trigger-only /
-- auth-trigger functions from the API roles (they still fire as triggers).
-- =============================================================================

begin;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'admin'
  );
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text in ('admin','reception','doctor')
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_staff() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staff() to authenticated;

-- Lint 0011 (function_search_path_mutable)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Lint 0028/0029: trigger-only & auth-trigger functions must not be RPC-callable.
revoke execute on function public.handle_new_user()             from public, anon, authenticated;
revoke execute on function public.appointments_log_status()     from public, anon, authenticated;
revoke execute on function public.appointments_set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_at()              from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at()           from public, anon, authenticated;
revoke execute on function public.tg_notify_appointment()       from public, anon, authenticated;
revoke execute on function public.tg_notify_document()          from public, anon, authenticated;
revoke execute on function public.tg_notify_follow_up()         from public, anon, authenticated;
revoke execute on function public.tg_mediflow_touch_thread()    from public, anon, authenticated;

comment on function private.is_admin() is 'True if the current auth user has the admin role.';
comment on function private.is_staff() is 'True if the current auth user has any staff role (admin/reception/doctor).';

commit;
