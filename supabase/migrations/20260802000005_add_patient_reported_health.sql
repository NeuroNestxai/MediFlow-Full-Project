-- =============================================================================
-- MediFlow AI — Patient-reported health information
-- Migration: 20260802000005_add_patient_reported_health  (ADDITIVE, IDEMPOTENT)
--
-- One row per patient holding self-reported allergies + current medications.
-- This is PATIENT-REPORTED, NOT a diagnosis or confirmed clinical record.
--
-- SAFETY: additive; single transaction; RLS-protected; own-row only; never
-- exposed to anon; no service-role. Preserves profiles + the signup trigger.
-- patient_id references public.profiles(id) (= auth.users.id) for consistency
-- with the rest of the schema.
-- =============================================================================

begin;

-- Reusable updated_at trigger helper (safe to (re)create).
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.patient_reported_health (
  patient_id          uuid primary key references public.profiles(id) on delete cascade,
  allergies           text check (allergies is null or char_length(allergies) <= 4000),
  current_medications text check (current_medications is null or char_length(current_medications) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_prh_set_updated_at on public.patient_reported_health;
create trigger trg_prh_set_updated_at
  before update on public.patient_reported_health
  for each row execute function public.tg_set_updated_at();

-- Row Level Security: own row only, patients only.
alter table public.patient_reported_health enable row level security;

revoke all on public.patient_reported_health from anon, authenticated;
grant select, insert, update on public.patient_reported_health to authenticated;

drop policy if exists prh_select_own on public.patient_reported_health;
create policy prh_select_own on public.patient_reported_health
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

drop policy if exists prh_insert_own on public.patient_reported_health;
create policy prh_insert_own on public.patient_reported_health
  for insert to authenticated
  with check (patient_id = (select auth.uid()) and private.is_patient());

drop policy if exists prh_update_own on public.patient_reported_health;
create policy prh_update_own on public.patient_reported_health
  for update to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient())
  with check (patient_id = (select auth.uid()) and private.is_patient());

commit;
