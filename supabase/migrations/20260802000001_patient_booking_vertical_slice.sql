-- =============================================================================
-- MediFlow AI — Patient booking vertical slice  (REVISED, pre-approval)
-- Migration: 20260802000001_patient_booking_vertical_slice
--
-- Scope: service/doctor directory + appointment booking + My Appointments.
-- Creates ONLY the minimum schema for the Patient workflow. Does NOT alter
-- existing `profiles` / `user_roles` (only adds a helpful index on the latter).
-- No Doctor/Reception/n8n objects. No diagnosis / severity / urgency / triage /
-- prescription columns.
--
-- Security model:
--   * Patients NEVER get direct INSERT/UPDATE on appointments.
--   * Booking + cancellation happen only through SECURITY DEFINER RPCs that
--     re-derive patient_id from auth.uid() and enforce the `patient` role.
--   * All SECURITY DEFINER functions use search_path = '' and fully-qualified
--     names, and are revoked from public/anon.
--   * RLS lets a patient SELECT only their own appointments/history.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Private schema for the authorization helper (never exposed via PostgREST).
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enum: operational appointment status (no clinical/triage meaning).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum (
      'scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Concurrency-safe reference sequence (never COUNT(*)/MAX()+1).
-- ---------------------------------------------------------------------------
create sequence if not exists public.appointment_ref_seq;

-- ===========================================================================
-- DIRECTORY TABLES
-- ===========================================================================

create table if not exists public.specialties (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  specialty_id  uuid not null references public.specialties(id) on delete restrict,
  name          text not null,
  description   text,
  age_group     text,
  -- price is stored server-side so the browser can never dictate it (unseeded).
  price         numeric(8,3),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.doctors (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  full_name         text not null,
  specialty_id      uuid references public.specialties(id) on delete set null,
  gender            text check (gender in ('Male', 'Female')),
  portrait_palette  smallint check (portrait_palette between 1 and 4),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Which services each doctor offers (many-to-many). A doctor with no rows here
-- is visible in the directory but has no currently bookable service.
create table if not exists public.doctor_services (
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  primary key (doctor_id, service_id)
);

create table if not exists public.doctor_availability (
  id              uuid primary key default gen_random_uuid(),
  doctor_id       uuid not null references public.doctors(id) on delete cascade,
  available_date  date not null,
  start_time      time not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (doctor_id, available_date, start_time)
);

-- ===========================================================================
-- APPOINTMENTS
-- ===========================================================================

create table if not exists public.appointments (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  patient_id        uuid not null references public.profiles(id) on delete cascade,
  doctor_id         uuid not null references public.doctors(id)  on delete restrict,
  service_id        uuid not null references public.services(id) on delete restrict,
  appointment_date  date not null,
  appointment_time  time not null,
  status            public.appointment_status not null default 'scheduled',
  patient_notes     text check (patient_notes is null or char_length(patient_notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Double-booking prevention (transaction-safe): one active appointment per
-- doctor/date/time. Cancelled appointments free the slot again.
create unique index if not exists appointments_no_double_booking
  on public.appointments (doctor_id, appointment_date, appointment_time)
  where status <> 'cancelled';

-- Append-only audit of status transitions (own appointments only, via RLS).
create table if not exists public.appointment_status_history (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  status          public.appointment_status not null,
  changed_by      uuid,
  changed_at      timestamptz not null default now()
);

-- ===========================================================================
-- INDEXES (RLS-referenced columns + frequent lookups)
-- ===========================================================================
create index if not exists appointments_patient_idx  on public.appointments (patient_id);
create index if not exists appointments_doctor_idx    on public.appointments (doctor_id);
create index if not exists appointments_service_idx   on public.appointments (service_id);
create index if not exists appointment_status_history_appt_idx
  on public.appointment_status_history (appointment_id);
create index if not exists doctor_availability_doctor_date_idx
  on public.doctor_availability (doctor_id, available_date);
create index if not exists doctor_services_service_idx on public.doctor_services (service_id);
-- Existing table: index the column used by the role helper / RLS (idempotent).
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

-- ===========================================================================
-- AUTHORIZATION HELPER (private, SECURITY DEFINER, hardened)
-- Reads role from public.user_roles — never from editable user metadata.
-- ===========================================================================
create or replace function private.is_patient()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'patient'
  );
$$;

revoke all on function private.is_patient() from public;
revoke all on function private.is_patient() from anon;
-- Minimum access: authenticated needs to call it (RLS + RPCs).
grant usage on schema private to authenticated;
grant execute on function private.is_patient() to authenticated;

-- ===========================================================================
-- INTEGRITY TRIGGERS
-- ===========================================================================

-- Maintain updated_at on any update (cancellation goes through the RPC).
create or replace function public.appointments_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_appointments_set_updated_at on public.appointments;
create trigger trg_appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.appointments_set_updated_at();

-- Record every insert / status change into history. SECURITY DEFINER so
-- patients can never write history directly; records auth.uid() when present.
create or replace function public.appointments_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.appointment_status_history (appointment_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.appointments_log_status() from public;
revoke all on function public.appointments_log_status() from anon;

drop trigger if exists trg_appointments_log_status on public.appointments;
create trigger trg_appointments_log_status
  after insert or update on public.appointments
  for each row execute function public.appointments_log_status();

-- ===========================================================================
-- BOOKING RPC — the ONLY way a patient may create an appointment.
-- ===========================================================================
create or replace function public.create_patient_appointment(
  p_doctor_id       uuid,
  p_service_id      uuid,
  p_availability_id uuid,
  p_patient_notes   text default null
)
returns table (
  reference         text,
  appointment_date  date,
  appointment_time  time,
  status            text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_date    date;
  v_time    time;
  v_ref     text;
  v_appt_id uuid;
begin
  -- 1. Authenticated patient only (role from user_roles, not metadata).
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 1b. Bound patient_notes length (safe, controlled error).
  if p_patient_notes is not null and char_length(p_patient_notes) > 2000 then
    raise exception 'notes_too_long' using errcode = '22001';
  end if;

  -- 2. Doctor active.
  if not exists (
    select 1 from public.doctors d where d.id = p_doctor_id and d.is_active
  ) then
    raise exception 'invalid_doctor' using errcode = '22023';
  end if;

  -- 3. Service active.
  if not exists (
    select 1 from public.services s where s.id = p_service_id and s.is_active
  ) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;

  -- 4. Doctor actually offers this service.
  if not exists (
    select 1 from public.doctor_services ds
    where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id
  ) then
    raise exception 'service_not_offered' using errcode = '22023';
  end if;

  -- 5. Availability belongs to that doctor, is active, and is in the future.
  select da.available_date, da.start_time
    into v_date, v_time
  from public.doctor_availability da
  where da.id = p_availability_id
    and da.doctor_id = p_doctor_id
    and da.is_active
    and da.available_date >= current_date;
  if not found then
    raise exception 'invalid_availability' using errcode = '22023';
  end if;

  -- 6. Concurrency-safe reference (sequence, never COUNT/MAX).
  v_ref := 'REF-' || to_char(now(), 'YYYY') || '-'
           || lpad(nextval('public.appointment_ref_seq')::text, 6, '0');

  -- 7. Insert. status/date/time/reference/patient_id are all server-derived.
  --    The partial unique index enforces double-booking prevention atomically.
  insert into public.appointments (
    reference, patient_id, doctor_id, service_id,
    appointment_date, appointment_time, status, patient_notes
  )
  values (
    v_ref, v_uid, p_doctor_id, p_service_id,
    v_date, v_time, 'scheduled',
    nullif(btrim(coalesce(p_patient_notes, '')), '')
  )
  returning id into v_appt_id;

  -- 8. Return only minimal, safe confirmation data (no internal IDs).
  return query
    select a.reference, a.appointment_date, a.appointment_time, a.status::text
    from public.appointments a
    where a.id = v_appt_id;

exception
  when unique_violation then
    -- Slot was taken by a concurrent booking.
    raise exception 'slot_unavailable' using errcode = '23505';
end;
$$;

revoke all on function
  public.create_patient_appointment(uuid, uuid, uuid, text) from public;
revoke all on function
  public.create_patient_appointment(uuid, uuid, uuid, text) from anon;
grant execute on function
  public.create_patient_appointment(uuid, uuid, uuid, text) to authenticated;

-- ===========================================================================
-- CANCELLATION RPC — the ONLY way a patient may cancel; changes status only.
-- ===========================================================================
create or replace function public.cancel_patient_appointment(
  p_appointment_id uuid
)
returns table (
  reference text,
  status    text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Own appointment, only from scheduled/confirmed; only status changes.
  update public.appointments a
     set status = 'cancelled'
   where a.id = p_appointment_id
     and a.patient_id = v_uid
     and a.status in ('scheduled', 'confirmed')
  returning a.reference into v_ref;

  if not found then
    raise exception 'not_cancellable' using errcode = '42501';
  end if;

  return query select v_ref, 'cancelled'::text;
end;
$$;

revoke all on function public.cancel_patient_appointment(uuid) from public;
revoke all on function public.cancel_patient_appointment(uuid) from anon;
grant execute on function public.cancel_patient_appointment(uuid) to authenticated;

-- ===========================================================================
-- AVAILABLE-SLOTS RPC — the ONLY way a patient reads bookable slots.
-- Booked (non-cancelled) slots are excluded so they never appear free.
-- Returns no patient/appointment data — only the free slot descriptors.
-- ===========================================================================
create or replace function public.get_available_slots(
  p_doctor_id  uuid,
  p_service_id uuid
)
returns table (
  availability_id  uuid,
  available_date   date,
  start_time       time
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Authenticated patient only.
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Doctor + service must be active, and the doctor must offer the service.
  if not exists (
    select 1 from public.doctors d where d.id = p_doctor_id and d.is_active
  ) then
    raise exception 'invalid_doctor' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.services s where s.id = p_service_id and s.is_active
  ) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.doctor_services ds
    where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id
  ) then
    raise exception 'service_not_offered' using errcode = '22023';
  end if;

  -- Active, future slots, minus any already taken by a non-cancelled booking.
  return query
    select da.id, da.available_date, da.start_time
    from public.doctor_availability da
    where da.doctor_id = p_doctor_id
      and da.is_active
      and da.available_date >= current_date
      and not exists (
        select 1
        from public.appointments a
        where a.doctor_id = da.doctor_id
          and a.appointment_date = da.available_date
          and a.appointment_time = da.start_time
          and a.status <> 'cancelled'
      )
    order by da.available_date, da.start_time;
end;
$$;

revoke all on function public.get_available_slots(uuid, uuid) from public;
revoke all on function public.get_available_slots(uuid, uuid) from anon;
grant execute on function public.get_available_slots(uuid, uuid) to authenticated;

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
alter table public.specialties                 enable row level security;
alter table public.services                     enable row level security;
alter table public.doctors                      enable row level security;
alter table public.doctor_services              enable row level security;
alter table public.doctor_availability          enable row level security;
alter table public.appointments                 enable row level security;
alter table public.appointment_status_history   enable row level security;

-- Directory: authenticated may READ active rows only; NO write policies exist,
-- so patients can never modify these tables.
drop policy if exists specialties_read on public.specialties;
create policy specialties_read on public.specialties
  for select to authenticated using (is_active);

drop policy if exists services_read on public.services;
create policy services_read on public.services
  for select to authenticated using (is_active);

drop policy if exists doctors_read on public.doctors;
create policy doctors_read on public.doctors
  for select to authenticated using (is_active);

-- Return a mapping only when BOTH the linked doctor and service are active.
drop policy if exists doctor_services_read on public.doctor_services;
create policy doctor_services_read on public.doctor_services
  for select to authenticated
  using (
    exists (select 1 from public.doctors d  where d.id = doctor_id  and d.is_active)
    and exists (select 1 from public.services s where s.id = service_id and s.is_active)
  );

-- NOTE: doctor_availability has NO SELECT policy and NO SELECT grant. Patients
-- must read slots via public.get_available_slots() so booked slots are hidden.
-- RLS stays enabled (default-deny); the SECURITY DEFINER RPC bypasses it safely.

-- Appointments: patient may SELECT only their own rows (and must be a patient).
-- No INSERT/UPDATE/DELETE policies — writes happen only via the RPCs above.
drop policy if exists appointments_select_own on public.appointments;
create policy appointments_select_own on public.appointments
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

-- Status history: readable only for the patient's own appointments.
drop policy if exists appointment_status_history_select_own
  on public.appointment_status_history;
create policy appointment_status_history_select_own on public.appointment_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id and a.patient_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- TABLE PRIVILEGE HARDENING
-- Explicitly strip ALL direct write privileges from anon + authenticated on
-- every new table, THEN grant only the exact SELECT privileges required.
-- (RLS still governs row visibility on top of these grants.)
-- ===========================================================================
revoke insert, update, delete, truncate, references, trigger
  on public.specialties,
     public.services,
     public.doctors,
     public.doctor_services,
     public.doctor_availability,
     public.appointments,
     public.appointment_status_history
  from anon, authenticated;

-- Directory tables readable by authenticated (RLS restricts to active rows).
-- doctor_availability is intentionally EXCLUDED — read it via get_available_slots.
grant select on public.specialties, public.services, public.doctors,
                public.doctor_services
  to authenticated;

-- Appointments + history: SELECT-only, own rows only via RLS. No write grant;
-- all writes go through the SECURITY DEFINER RPCs.
grant select on public.appointments to authenticated;
grant select on public.appointment_status_history to authenticated;

-- ===========================================================================
-- SEED DATA — synthetic clinic data already approved in the project
-- (mirrors src/data/mock-services.ts and src/data/mock-doctors.ts only).
-- Fixed UUIDs for stable references. No invented doctors or services.
-- ===========================================================================

insert into public.specialties (id, slug, name) values
  ('11111111-1111-1111-1111-111111111101', 'general-chronic-care', 'General & Chronic Care'),
  ('11111111-1111-1111-1111-111111111102', 'general-dentistry',    'General Dentistry'),
  ('11111111-1111-1111-1111-111111111103', 'orthodontics',         'Orthodontics')
on conflict (slug) do nothing;

insert into public.services (id, slug, specialty_id, name, description, age_group) values
  ('22222222-2222-2222-2222-222222222201', 'cleaning-whitening',
     '11111111-1111-1111-1111-111111111102', 'Cleaning & Whitening',
     'A routine dental cleaning to remove plaque and brighten your smile.', 'All Ages'),
  ('22222222-2222-2222-2222-222222222202', 'diabetes-followup',
     '11111111-1111-1111-1111-111111111101', 'Diabetes & Blood-Pressure Follow-up',
     'A routine follow-up visit for ongoing chronic care management.', 'Adults'),
  ('22222222-2222-2222-2222-222222222203', 'root-canal',
     '11111111-1111-1111-1111-111111111102', 'Root-Canal Treatment',
     'Treatment for infected or damaged tooth pulp.', 'Adults')
on conflict (slug) do nothing;

insert into public.doctors (id, slug, full_name, specialty_id, gender, portrait_palette) values
  ('33333333-3333-3333-3333-333333333301', 'abbas-pakkyara', 'Dr. Abbas Pakkyara',
     '11111111-1111-1111-1111-111111111101', 'Male', 1),
  ('33333333-3333-3333-3333-333333333302', 'khawla-al-hotti', 'Dr. Khawla Al Hotti',
     '11111111-1111-1111-1111-111111111102', 'Female', 2),
  ('33333333-3333-3333-3333-333333333303', 'fadi-mosa', 'Dr. Fadi Mosa',
     '11111111-1111-1111-1111-111111111103', 'Male', 3)
on conflict (slug) do nothing;

-- Doctor ↔ service mapping: ONLY relationships supported by the approved data.
-- There is no approved Orthodontics service, so Dr. Fadi Mosa gets NO mapping
-- (visible in the directory, but shown as having no bookable service).
insert into public.doctor_services (doctor_id, service_id) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222202'), -- Abbas  → Diabetes follow-up
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201'), -- Khawla → Cleaning & Whitening
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222203')  -- Khawla → Root-Canal
on conflict do nothing;

-- Availability: FUTURE ONLY, generated relative to the execution date.
-- current_date + 1 .. current_date + 14, clinic daytime slots (08:00–14:00),
-- for doctors who currently offer at least one service (Abbas, Khawla).
insert into public.doctor_availability (doctor_id, available_date, start_time)
select d.id, g.day::date, t.slot::time
from public.doctors d
cross join generate_series(current_date + 1, current_date + 14, interval '1 day') as g(day)
cross join (values ('08:00'), ('09:00'), ('10:00'), ('11:00'), ('13:00'), ('14:00')) as t(slot)
where d.is_active
  and exists (select 1 from public.doctor_services ds where ds.doctor_id = d.id)
on conflict (doctor_id, available_date, start_time) do nothing;

commit;
