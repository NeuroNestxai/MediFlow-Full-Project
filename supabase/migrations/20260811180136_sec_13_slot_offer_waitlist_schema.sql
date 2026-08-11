-- =============================================================================
-- MediFlow AI — Cancellation waitlist (Option A: opt-in). Schema layer.
-- Migration: 20260811180136_sec_13_slot_offer_waitlist_schema  (IDEMPOTENT)
--
-- When an appointment is cancelled, the freed slot is offered to the highest-
-- priority opted-in patient who currently has a LATER appointment with the same
-- doctor. Their choice (move up / keep) then needs admin/reception approval,
-- with an email on approval. See supabase/CANCELLATION_WAITLIST.md.
-- =============================================================================

begin;

alter table public.appointments
  add column if not exists wants_earlier boolean not null default false;

create table if not exists public.slot_offers (
  id                       uuid primary key default gen_random_uuid(),
  freed_appointment_id     uuid references public.appointments(id) on delete set null,
  doctor_id                uuid not null references public.doctors(id) on delete cascade,
  offer_date               date not null,
  offer_time               time without time zone not null,
  candidate_appointment_id uuid not null references public.appointments(id) on delete cascade,
  candidate_user_id        uuid not null references auth.users(id) on delete cascade,
  status                   text not null default 'offered'
    check (status in ('offered','accepted','declined','expired','approved','rejected','cancelled')),
  reason                   text check (reason is null or char_length(reason) <= 1000),
  created_at               timestamptz not null default now(),
  expires_at               timestamptz not null,
  responded_at             timestamptz,
  decided_by               uuid references auth.users(id) on delete set null,
  decided_at               timestamptz
);
comment on table public.slot_offers is
  'Waitlist promotion offers created when an appointment is cancelled. Patient accepts/declines; admin/reception approves the move.';

create index if not exists slot_offers_candidate_idx on public.slot_offers (candidate_user_id);
create index if not exists slot_offers_status_idx    on public.slot_offers (status);
create index if not exists slot_offers_slot_idx      on public.slot_offers (doctor_id, offer_date, offer_time);

alter table public.slot_offers enable row level security;

drop policy if exists slot_offers_select_own on public.slot_offers;
drop policy if exists slot_offers_select_staff on public.slot_offers;

create policy slot_offers_select_own on public.slot_offers
  for select to authenticated
  using ( candidate_user_id = (select auth.uid()) and private.is_patient() );

create policy slot_offers_select_staff on public.slot_offers
  for select to authenticated
  using ( private.is_admin() or private.is_reception() );

grant select on public.slot_offers to authenticated;

create or replace function public.patient_set_wants_earlier(p_appointment_id uuid, p_wants boolean)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode='42501'; end if;
  update public.appointments
     set wants_earlier = coalesce(p_wants, false)
   where id = p_appointment_id and patient_id = auth.uid()
     and status in ('pending_approval','scheduled','confirmed');
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.patient_set_wants_earlier(uuid, boolean) from public, anon;
grant execute on function public.patient_set_wants_earlier(uuid, boolean) to authenticated;

create or replace view public.dashboard_my_slot_offers
with (security_invoker = true) as
select so.id as offer_id, so.offer_date, so.offer_time, so.status, so.expires_at,
       a.reference as my_reference, a.appointment_date as my_current_date, a.appointment_time as my_current_time,
       d.full_name as doctor_name
from public.slot_offers so
join public.appointments a on a.id = so.candidate_appointment_id
left join public.doctors d on d.id = so.doctor_id
where so.candidate_user_id = (select auth.uid()) and private.is_patient()
  and so.status in ('offered','accepted');

create or replace view public.dashboard_slot_offers_pending
with (security_invoker = true) as
select so.id as offer_id, so.offer_date, so.offer_time, so.status, so.responded_at,
       pt.full_name, a.reference, a.appointment_date as current_date, a.appointment_time as current_time,
       d.full_name as doctor_name
from public.slot_offers so
join public.appointments a on a.id = so.candidate_appointment_id
join public.patients pt on pt.user_id = so.candidate_user_id
left join public.doctors d on d.id = so.doctor_id
where (private.is_admin() or private.is_reception()) and so.status = 'accepted';

grant select on public.dashboard_my_slot_offers      to authenticated;
grant select on public.dashboard_slot_offers_pending to authenticated;

commit;
