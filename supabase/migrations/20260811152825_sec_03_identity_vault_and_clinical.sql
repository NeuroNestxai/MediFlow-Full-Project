-- =============================================================================
-- MediFlow AI — Security hardening 03: identity vault + clinical split
-- Migration: 20260811152825_sec_03_identity_vault_and_clinical  (IDEMPOTENT)
--
-- Req 4: name/age/gender/email + encrypted civil_id live in a locked identity
--        vault (repurposes the empty `patients` table). Admin/reception/self
--        only — NEVER doctor or agent.
-- Req 1: clinical data (history/meds/allergies + symptoms) lives in a separate
--        `patient_clinical` table with no identity fields (the agent's source,
--        replacing the Excel hand-off).
-- =============================================================================

begin;

-- ---- 3a. Reshape empty `patients` into the identity vault ----
alter table public.patients
  drop column if exists medical_history,
  drop column if exists current_medications,
  drop column if exists allergies;

alter table public.patients
  add column if not exists civil_id_encrypted bytea,
  add column if not exists email text,
  add column if not exists updated_at timestamptz not null default now();

comment on table public.patients is
  'Identity vault: name/age/gender/email + encrypted civil_id. Admin/reception/self only; NEVER doctor or agent.';
comment on column public.patients.civil_id_encrypted is
  'pgcrypto pgp_sym ciphertext. Read/write only via admin_*_patient_civil_id(); plaintext never stored.';

drop trigger if exists trg_patients_set_updated_at on public.patients;
create trigger trg_patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

insert into public.patients (user_id, full_name, preferred_display_name, email)
select ur.user_id, coalesce(p.full_name, ''), p.preferred_name, u.email
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
join auth.users u on u.id = ur.user_id
where ur.role::text = 'patient'
on conflict (user_id) do nothing;

-- ---- 3b. RLS: identity vault is admin/reception/self only ----
drop policy if exists "Patients can view their own record" on public.patients;
drop policy if exists patients_select_self on public.patients;
drop policy if exists patients_select_admin_reception on public.patients;
drop policy if exists patients_write_admin on public.patients;

create policy patients_select_self on public.patients
  for select to authenticated
  using ( user_id = (select auth.uid()) and private.is_patient() );

create policy patients_select_admin_reception on public.patients
  for select to authenticated
  using ( private.is_admin() or private.is_reception() );

create policy patients_write_admin on public.patients
  for all to authenticated
  using ( private.is_admin() )
  with check ( private.is_admin() );

revoke select (civil_id_encrypted) on public.patients from anon, authenticated;

-- ---- 3c. Admin-gated civil_id accessors (only path to plaintext) ----
create or replace function public.admin_set_patient_civil_id(p_user_id uuid, p_civil_id text)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  if not private.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.patients
     set civil_id_encrypted = private.encrypt_civil_id(p_civil_id), updated_at = now()
   where user_id = p_user_id;
  if not found then raise exception 'patient_not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.admin_get_patient_civil_id(p_user_id uuid)
returns text language plpgsql stable security definer set search_path to '' as $$
declare v_plain text;
begin
  if not private.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select private.decrypt_civil_id(civil_id_encrypted) into v_plain
  from public.patients where user_id = p_user_id;
  return v_plain;
end;
$$;

revoke all on function public.admin_set_patient_civil_id(uuid, text) from public, anon;
revoke all on function public.admin_get_patient_civil_id(uuid)       from public, anon;
grant execute on function public.admin_set_patient_civil_id(uuid, text) to authenticated;
grant execute on function public.admin_get_patient_civil_id(uuid)       to authenticated;

-- ---- 3d. Clinical record (agent-facing; keyed by user_id; NO identity) ----
create table if not exists public.patient_clinical (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  medical_history     text check (medical_history is null or char_length(medical_history) <= 8000),
  current_medications text check (current_medications is null or char_length(current_medications) <= 4000),
  allergies           text check (allergies is null or char_length(allergies) <= 4000),
  presenting_symptoms text check (presenting_symptoms is null or char_length(presenting_symptoms) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.patient_clinical is
  'Clinical data staged for the AI agent (replaces the Excel hand-off). Keyed by user_id; contains NO name/age/gender/civil_id/email.';

alter table public.patient_clinical enable row level security;

drop trigger if exists trg_patient_clinical_set_updated_at on public.patient_clinical;
create trigger trg_patient_clinical_set_updated_at
  before update on public.patient_clinical
  for each row execute function public.set_updated_at();

drop policy if exists patient_clinical_select_own on public.patient_clinical;
drop policy if exists patient_clinical_upsert_own on public.patient_clinical;
drop policy if exists patient_clinical_update_own on public.patient_clinical;
drop policy if exists patient_clinical_select_doctor on public.patient_clinical;
drop policy if exists patient_clinical_admin on public.patient_clinical;

create policy patient_clinical_select_own on public.patient_clinical
  for select to authenticated
  using ( user_id = (select auth.uid()) and private.is_patient() );

create policy patient_clinical_upsert_own on public.patient_clinical
  for insert to authenticated
  with check ( user_id = (select auth.uid()) and private.is_patient() );

create policy patient_clinical_update_own on public.patient_clinical
  for update to authenticated
  using ( user_id = (select auth.uid()) and private.is_patient() )
  with check ( user_id = (select auth.uid()) and private.is_patient() );

create policy patient_clinical_select_doctor on public.patient_clinical
  for select to authenticated
  using ( private.is_doctor() and private.doctor_has_patient(user_id) );

create policy patient_clinical_admin on public.patient_clinical
  for all to authenticated
  using ( private.is_admin() )
  with check ( private.is_admin() );

grant select, insert, update on public.patient_clinical to authenticated;

-- ---- 3e. Keep the vault populated for future signups ----
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.profiles (id, full_name, preferred_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'preferred_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'patient')
  on conflict (user_id) do nothing;

  insert into public.patients (user_id, full_name, preferred_display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'preferred_name',
    new.email
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
