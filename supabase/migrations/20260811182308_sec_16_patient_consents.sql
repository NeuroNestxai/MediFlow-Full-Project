-- =============================================================================
-- MediFlow AI — Data-use consent record
-- Migration: 20260811182308_sec_16_patient_consents  (IDEMPOTENT)
-- Backend for the "clear data-use disclaimer" the evaluator asked for.
-- =============================================================================

begin;

create table if not exists public.patient_consents (
  user_id      uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('ai_data_use','privacy_policy','terms')),
  version      text not null default 'v1',
  granted      boolean not null default true,
  granted_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, consent_type)
);
comment on table public.patient_consents is
  'Records patient acceptance of the data-use disclaimer (e.g. ai_data_use: symptoms, not name, shared with the AI).';

alter table public.patient_consents enable row level security;

drop trigger if exists trg_patient_consents_updated_at on public.patient_consents;
create trigger trg_patient_consents_updated_at
  before update on public.patient_consents
  for each row execute function public.set_updated_at();

drop policy if exists patient_consents_own on public.patient_consents;
drop policy if exists patient_consents_staff on public.patient_consents;

create policy patient_consents_own on public.patient_consents
  for all to authenticated
  using ( user_id = (select auth.uid()) and private.is_patient() )
  with check ( user_id = (select auth.uid()) and private.is_patient() );

create policy patient_consents_staff on public.patient_consents
  for select to authenticated
  using ( private.is_admin() or private.is_reception() );

grant select, insert, update on public.patient_consents to authenticated;

create or replace function public.record_consent(p_consent_type text, p_version text default 'v1', p_granted boolean default true)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_consent_type not in ('ai_data_use','privacy_policy','terms') then
    raise exception 'invalid_consent_type' using errcode='22023';
  end if;
  insert into public.patient_consents (user_id, consent_type, version, granted)
  values (auth.uid(), p_consent_type, coalesce(nullif(btrim(p_version),''),'v1'), coalesce(p_granted, true))
  on conflict (user_id, consent_type) do update
    set version=excluded.version, granted=excluded.granted, granted_at=now(), updated_at=now();
end;
$$;
revoke all on function public.record_consent(text, text, boolean) from public, anon;
grant execute on function public.record_consent(text, text, boolean) to authenticated;

commit;
