-- =============================================================================
-- MediFlow AI — Audit log + MFA (AAL2) helpers
-- Migration: 20260811182327_sec_17_audit_log_and_mfa_helpers  (IDEMPOTENT)
-- =============================================================================

begin;

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid,
  actor_role    text,
  action        text not null,
  target_type   text,
  target_id     text,
  details       jsonb
);
comment on table public.audit_log is
  'Append-only audit trail of sensitive actions (civil-id access, approvals, agent writes). Admin-readable only.';

create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_action_idx   on public.audit_log (action);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using ( private.is_admin() );

grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;

create or replace function private.log_audit(
  p_action text, p_target_type text default null, p_target_id text default null, p_details jsonb default null)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  insert into public.audit_log (actor_user_id, actor_role, action, target_type, target_id, details)
  values (auth.uid(),
          coalesce((select ur.role::text from public.user_roles ur where ur.user_id = auth.uid()), 'system'),
          p_action, p_target_type, p_target_id, p_details);
exception when others then
  null;  -- auditing must never break the underlying action
end;
$$;
revoke all on function private.log_audit(text, text, text, jsonb) from public, anon, authenticated;

create or replace function private.has_aal2()
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function private.require_aal2()
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.has_aal2() then
    raise exception 'mfa_required' using errcode='42501';
  end if;
end;
$$;
revoke all on function private.has_aal2()     from public, anon;
revoke all on function private.require_aal2() from public, anon;
grant execute on function private.has_aal2()     to authenticated;
grant execute on function private.require_aal2() to authenticated;
comment on function private.require_aal2() is 'Raises mfa_required unless the caller has an AAL2 (MFA-verified) session.';

commit;
