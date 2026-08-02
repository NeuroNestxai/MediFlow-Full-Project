-- =============================================================================
-- MediFlow AI — Demo doctor availability (Option B2: rolling future projection)
-- Migration: 20260802000003_add_demo_doctor_availability
-- Source: docs/datasets/... sheet 08 (Mock Doctor Schedules) — DEMO ONLY.
--
-- We DO NOT import sheet 09's fixed (now-expired) slot dates. Instead we project
-- the 55 weekday shift rules from sheet 08 onto ROLLING FUTURE dates
-- (current_date + 1 .. current_date + 28) at each schedule's slot duration,
-- for ALL 11 doctors that have workbook demo schedules.
--
-- PROVENANCE: adds is_demo / source_label / source_schedule_id to
-- doctor_availability. Every generated row is is_demo = true with a source_label
-- stating it is prototype/demo data, NOT an official MCC schedule. Pre-existing
-- synthetic availability is also tagged is_demo = true for honest display.
--
-- SAFETY: single transaction; additive columns; ON CONFLICT (doctor_id,
-- available_date, start_time) DO NOTHING prevents duplicates and preserves any
-- existing slot (and therefore the existing appointment's slot). No past dates
-- are ever generated. Idempotent: re-running fills newly-in-window future days
-- and skips existing ones; already-generated days simply age out of results as
-- get_available_slots filters available_date >= current_date.
--
-- RPC: get_available_slots is left UNCHANGED (same return type). A NEW,
-- backward-compatible public.get_available_slots_v2 additionally returns
-- is_demo + source_label so the Patient UI can label demo availability without
-- breaking existing booking code.
-- =============================================================================

begin;

alter table public.doctor_availability
  add column if not exists is_demo           boolean not null default false,
  add column if not exists source_label      text,
  add column if not exists source_schedule_id text;

-- Tag pre-existing (synthetic) availability as demo for consistent display.
update public.doctor_availability
   set is_demo = true,
       source_label = coalesce(source_label, 'Prototype/demo availability — not an official MCC schedule')
 where is_demo = false;

-- Project sheet-08 weekday shift rules onto rolling FUTURE dates.
with sched(doctor_id, dow, shift_start, shift_end, slot_min, schedule_id) as (
  values
  ('33333333-3333-3333-3333-333333333301'::uuid, 0, time '08:00', time '14:00', 30, 'SCH-01-01'),  -- Abbas Pakkyara Sunday
  ('33333333-3333-3333-3333-333333333301'::uuid, 1, time '08:00', time '14:00', 30, 'SCH-01-02'),  -- Abbas Pakkyara Monday
  ('33333333-3333-3333-3333-333333333301'::uuid, 2, time '08:00', time '14:00', 30, 'SCH-01-03'),  -- Abbas Pakkyara Tuesday
  ('33333333-3333-3333-3333-333333333301'::uuid, 3, time '08:00', time '14:00', 30, 'SCH-01-04'),  -- Abbas Pakkyara Wednesday
  ('33333333-3333-3333-3333-333333333301'::uuid, 4, time '08:00', time '14:00', 30, 'SCH-01-05'),  -- Abbas Pakkyara Thursday
  ('33333333-3333-3333-3333-333333333302'::uuid, 0, time '09:00', time '15:00', 30, 'SCH-02-01'),  -- Khawla Al Hotti Sunday
  ('33333333-3333-3333-3333-333333333302'::uuid, 1, time '09:00', time '15:00', 30, 'SCH-02-02'),  -- Khawla Al Hotti Monday
  ('33333333-3333-3333-3333-333333333302'::uuid, 2, time '09:00', time '15:00', 30, 'SCH-02-03'),  -- Khawla Al Hotti Tuesday
  ('33333333-3333-3333-3333-333333333302'::uuid, 3, time '09:00', time '15:00', 30, 'SCH-02-04'),  -- Khawla Al Hotti Wednesday
  ('33333333-3333-3333-3333-333333333302'::uuid, 4, time '09:00', time '15:00', 30, 'SCH-02-05'),  -- Khawla Al Hotti Thursday
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438'::uuid, 0, time '10:00', time '16:00', 40, 'SCH-03-01'),  -- Hayat Al Koyoumi Sunday
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438'::uuid, 1, time '10:00', time '16:00', 40, 'SCH-03-02'),  -- Hayat Al Koyoumi Monday
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438'::uuid, 2, time '10:00', time '16:00', 40, 'SCH-03-03'),  -- Hayat Al Koyoumi Tuesday
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438'::uuid, 3, time '10:00', time '16:00', 40, 'SCH-03-04'),  -- Hayat Al Koyoumi Wednesday
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438'::uuid, 4, time '10:00', time '16:00', 40, 'SCH-03-05'),  -- Hayat Al Koyoumi Thursday
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb'::uuid, 0, time '08:30', time '14:30', 30, 'SCH-04-01'),  -- Nadia Al Hajri Sunday
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb'::uuid, 1, time '08:30', time '14:30', 30, 'SCH-04-02'),  -- Nadia Al Hajri Monday
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb'::uuid, 2, time '08:30', time '14:30', 30, 'SCH-04-03'),  -- Nadia Al Hajri Tuesday
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb'::uuid, 3, time '08:30', time '14:30', 30, 'SCH-04-04'),  -- Nadia Al Hajri Wednesday
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb'::uuid, 4, time '08:30', time '14:30', 30, 'SCH-04-05'),  -- Nadia Al Hajri Thursday
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455'::uuid, 0, time '11:00', time '17:00', 45, 'SCH-05-01'),  -- Samar Al Sinani Sunday
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455'::uuid, 1, time '11:00', time '17:00', 45, 'SCH-05-02'),  -- Samar Al Sinani Monday
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455'::uuid, 2, time '11:00', time '17:00', 45, 'SCH-05-03'),  -- Samar Al Sinani Tuesday
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455'::uuid, 3, time '11:00', time '17:00', 45, 'SCH-05-04'),  -- Samar Al Sinani Wednesday
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455'::uuid, 4, time '11:00', time '17:00', 45, 'SCH-05-05'),  -- Samar Al Sinani Thursday
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e'::uuid, 0, time '08:00', time '14:00', 30, 'SCH-06-01'),  -- Fatma Al Khoudr Sunday
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e'::uuid, 1, time '08:00', time '14:00', 30, 'SCH-06-02'),  -- Fatma Al Khoudr Monday
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e'::uuid, 2, time '08:00', time '14:00', 30, 'SCH-06-03'),  -- Fatma Al Khoudr Tuesday
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e'::uuid, 3, time '08:00', time '14:00', 30, 'SCH-06-04'),  -- Fatma Al Khoudr Wednesday
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e'::uuid, 4, time '08:00', time '14:00', 30, 'SCH-06-05'),  -- Fatma Al Khoudr Thursday
  ('33333333-3333-3333-3333-333333333303'::uuid, 0, time '09:00', time '15:00', 30, 'SCH-07-01'),  -- Fadi Mosa Sunday
  ('33333333-3333-3333-3333-333333333303'::uuid, 1, time '09:00', time '15:00', 30, 'SCH-07-02'),  -- Fadi Mosa Monday
  ('33333333-3333-3333-3333-333333333303'::uuid, 2, time '09:00', time '15:00', 30, 'SCH-07-03'),  -- Fadi Mosa Tuesday
  ('33333333-3333-3333-3333-333333333303'::uuid, 3, time '09:00', time '15:00', 30, 'SCH-07-04'),  -- Fadi Mosa Wednesday
  ('33333333-3333-3333-3333-333333333303'::uuid, 4, time '09:00', time '15:00', 30, 'SCH-07-05'),  -- Fadi Mosa Thursday
  ('c449c097-775a-510c-9300-e2bb8fb1d298'::uuid, 0, time '10:00', time '16:00', 40, 'SCH-08-01'),  -- Magdi Ashria Sunday
  ('c449c097-775a-510c-9300-e2bb8fb1d298'::uuid, 1, time '10:00', time '16:00', 40, 'SCH-08-02'),  -- Magdi Ashria Monday
  ('c449c097-775a-510c-9300-e2bb8fb1d298'::uuid, 2, time '10:00', time '16:00', 40, 'SCH-08-03'),  -- Magdi Ashria Tuesday
  ('c449c097-775a-510c-9300-e2bb8fb1d298'::uuid, 3, time '10:00', time '16:00', 40, 'SCH-08-04'),  -- Magdi Ashria Wednesday
  ('c449c097-775a-510c-9300-e2bb8fb1d298'::uuid, 4, time '10:00', time '16:00', 40, 'SCH-08-05'),  -- Magdi Ashria Thursday
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf'::uuid, 0, time '08:30', time '14:30', 30, 'SCH-09-01'),  -- Nawal Al Maskari Sunday
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf'::uuid, 1, time '08:30', time '14:30', 30, 'SCH-09-02'),  -- Nawal Al Maskari Monday
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf'::uuid, 2, time '08:30', time '14:30', 30, 'SCH-09-03'),  -- Nawal Al Maskari Tuesday
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf'::uuid, 3, time '08:30', time '14:30', 30, 'SCH-09-04'),  -- Nawal Al Maskari Wednesday
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf'::uuid, 4, time '08:30', time '14:30', 30, 'SCH-09-05'),  -- Nawal Al Maskari Thursday
  ('a5729a99-8e4b-5523-897e-7b2897a0c202'::uuid, 0, time '11:00', time '17:00', 45, 'SCH-10-01'),  -- Raya Al Hajri Sunday
  ('a5729a99-8e4b-5523-897e-7b2897a0c202'::uuid, 1, time '11:00', time '17:00', 45, 'SCH-10-02'),  -- Raya Al Hajri Monday
  ('a5729a99-8e4b-5523-897e-7b2897a0c202'::uuid, 2, time '11:00', time '17:00', 45, 'SCH-10-03'),  -- Raya Al Hajri Tuesday
  ('a5729a99-8e4b-5523-897e-7b2897a0c202'::uuid, 3, time '11:00', time '17:00', 45, 'SCH-10-04'),  -- Raya Al Hajri Wednesday
  ('a5729a99-8e4b-5523-897e-7b2897a0c202'::uuid, 4, time '11:00', time '17:00', 45, 'SCH-10-05'),  -- Raya Al Hajri Thursday
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c'::uuid, 0, time '08:00', time '14:00', 30, 'SCH-11-01'),  -- Siham Sunday
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c'::uuid, 1, time '08:00', time '14:00', 30, 'SCH-11-02'),  -- Siham Monday
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c'::uuid, 2, time '08:00', time '14:00', 30, 'SCH-11-03'),  -- Siham Tuesday
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c'::uuid, 3, time '08:00', time '14:00', 30, 'SCH-11-04'),  -- Siham Wednesday
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c'::uuid, 4, time '08:00', time '14:00', 30, 'SCH-11-05')  -- Siham Thursday
),
-- window: tomorrow .. +28 days
future_dates as (
  select gd::date as slot_date
  from generate_series(current_date + 1, current_date + 28, interval '1 day') as g(gd)
),
demo_slots as (
  select s.doctor_id,
         fd.slot_date,
         (s.shift_start + make_interval(mins => g.n))::time as start_time,
         s.schedule_id
  from future_dates fd
  join sched s on s.dow = extract(dow from fd.slot_date)::int
  cross join lateral generate_series(
    0,
    (extract(epoch from (s.shift_end - s.shift_start)) / 60)::int - s.slot_min,
    s.slot_min
  ) as g(n)
)
insert into public.doctor_availability
  (doctor_id, available_date, start_time, is_active, is_demo, source_label, source_schedule_id)
select doctor_id, slot_date, start_time, true, true,
       'Prototype/demo availability — not an official MCC schedule', schedule_id
from demo_slots
on conflict (doctor_id, available_date, start_time) do nothing;

-- ---------------------------------------------------------------------------
-- Backward-compatible v2 slots RPC (adds is_demo + source_label). v1 untouched.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots_v2(
  p_doctor_id  uuid,
  p_service_id uuid
)
returns table (
  availability_id uuid,
  available_date  date,
  start_time      time,
  is_demo         boolean,
  source_label    text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.doctors d  where d.id = p_doctor_id  and d.is_active) then
    raise exception 'invalid_doctor' using errcode = '22023'; end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.is_active) then
    raise exception 'invalid_service' using errcode = '22023'; end if;
  if not exists (select 1 from public.doctor_services ds where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id) then
    raise exception 'service_not_offered' using errcode = '22023'; end if;

  return query
    select da.id, da.available_date, da.start_time, da.is_demo, da.source_label
    from public.doctor_availability da
    where da.doctor_id = p_doctor_id
      and da.is_active
      and da.available_date >= current_date
      and not exists (
        select 1 from public.appointments a
        where a.doctor_id = da.doctor_id
          and a.appointment_date = da.available_date
          and a.appointment_time = da.start_time
          and a.status <> 'cancelled'
      )
    order by da.available_date, da.start_time;
end;
$$;

revoke all on function public.get_available_slots_v2(uuid, uuid) from public;
revoke all on function public.get_available_slots_v2(uuid, uuid) from anon;
grant execute on function public.get_available_slots_v2(uuid, uuid) to authenticated;

commit;
