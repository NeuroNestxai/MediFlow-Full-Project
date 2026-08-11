-- =============================================================================
-- MediFlow AI — Security alerting hook (email on high-risk actions)
-- Migration: 20260811190513_sec_23_security_alerting_hook  (IDEMPOTENT)
--
-- High-risk audited actions also enqueue an alert email into email_outbox,
-- delivered by the same n8n Gmail node. Recipient is configurable in app_settings.
-- =============================================================================

begin;

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_admin_read on public.app_settings;
create policy app_settings_admin_read on public.app_settings
  for select to authenticated using ( private.is_admin() );
grant select on public.app_settings to authenticated;
revoke insert, update, delete on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('security_alert_email', 'safesightxai@gmail.com')
on conflict (key) do nothing;

create or replace function private.log_audit(
  p_action text, p_target_type text default null, p_target_id text default null, p_details jsonb default null)
returns void language plpgsql volatile security definer set search_path to '' as $$
declare v_alert_email text;
begin
  insert into public.audit_log (actor_user_id, actor_role, action, target_type, target_id, details)
  values (auth.uid(),
          coalesce((select string_agg(ur.role::text, ',' order by ur.role::text)
                    from public.user_roles ur where ur.user_id = auth.uid()), 'system'),
          p_action, p_target_type, p_target_id, p_details);

  if p_action in ('civil_id_decrypt','civil_id_set','patient_data_erased') then
    select value into v_alert_email from public.app_settings where key='security_alert_email';
    if v_alert_email is not null then
      insert into public.email_outbox (to_email, subject, body, template)
      values (v_alert_email,
        'MediFlow security alert: ' || p_action,
        'A high-risk action was performed on MediFlow.' || chr(10) ||
        '- Action: ' || p_action || chr(10) ||
        '- Target: ' || coalesce(p_target_type || ' ' || p_target_id, '-') || chr(10) ||
        '- Actor (user id): ' || coalesce(auth.uid()::text, 'system') || chr(10) ||
        '- Time (UTC): ' || now()::text || chr(10) || chr(10) ||
        'If this was not expected, investigate in the audit_log table.',
        'security_alert');
    end if;
  end if;
exception when others then
  null;
end;
$$;
revoke all on function private.log_audit(text, text, text, jsonb) from public, anon, authenticated;

commit;
