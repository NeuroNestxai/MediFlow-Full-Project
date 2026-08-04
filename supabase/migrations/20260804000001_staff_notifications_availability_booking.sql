-- =============================================================================
-- MediFlow AI — Staff notifications + doctor availability + reception booking
-- Migration: 20260804000001_staff_notifications_availability_booking
--            (ADDITIVE, IDEMPOTENT)
--
-- Completes the Doctor and Reception roles by adding the smallest safe backend
-- support the finished screens need. It changes NOTHING that already works:
--
--   * NO existing table, column, RPC, policy or trigger is dropped or renamed.
--   * NO existing RLS policy is weakened. The patient notification trigger
--     (public.tg_notify_appointment) is left completely untouched — the staff
--     feed is a SEPARATE table with its OWN trigger.
--   * NO diagnosis / severity / urgency / triage / prescription concept is
--     introduced. Notification bodies carry operational text only (reference,
--     date, time, patient display name) — never clinical information.
--   * Every write path is a SECURITY DEFINER function with search_path = '',
--     the actor re-derived from auth.uid() and the role re-checked from
--     public.user_roles via the existing private.is_doctor / is_reception
--     helpers. The client is never trusted for a role.
--
-- Depends on objects created by earlier migrations:
--   private.is_doctor(), private.is_reception(), private.current_doctor_id(),
--   private.require_staff(text), public.tg_set_updated_at(),
--   public.appointment_ref_seq, public.appointment_status (with the extended
--   values), public.doctor_availability(is_active/is_demo/source_label).
-- =============================================================================

begin;

-- ===========================================================================
-- 1. STAFF NOTIFICATIONS
--    One operational feed, addressed by role. Reception rows are shared by the
--    front desk (recipient_role = 'reception', doctor_id null); doctor rows are
--    addressed to a specific doctor record (recipient_role = 'doctor',
--    doctor_id = that doctor). RLS keeps the two strictly apart, and keeps
--    every row invisible to patients.
-- ===========================================================================
create table if not exists public.staff_notifications (
  id                      uuid primary key default gen_random_uuid(),
  recipient_role          text not null check (recipient_role in ('doctor', 'reception')),
  doctor_id               uuid references public.doctors(id) on delete cascade,
  type                    text not null,
  title                   text not null,
  message                 text not null,
  related_appointment_id  uuid references public.appointments(id) on delete set null,
  is_read                 boolean not null default false,
  created_at              timestamptz not null default now(),
  read_at                 timestamptz,
  -- A doctor row must name its doctor; a reception row must not.
  constraint staff_notifications_recipient_shape check (
    (recipient_role = 'doctor'    and doctor_id is not null) or
    (recipient_role = 'reception' and doctor_id is null)
  )
);

create index if not exists staff_notifications_reception_idx
  on public.staff_notifications (recipient_role, is_read, created_at desc)
  where recipient_role = 'reception';

create index if not exists staff_notifications_doctor_idx
  on public.staff_notifications (doctor_id, is_read, created_at desc)
  where recipient_role = 'doctor';

alter table public.staff_notifications enable row level security;
revoke all on public.staff_notifications from anon, authenticated;
grant select on public.staff_notifications to authenticated;

-- Reception reads the shared front-desk feed; a doctor reads only their own.
-- Patients match neither branch, so the feed is invisible to them.
drop policy if exists staff_notifications_select on public.staff_notifications;
create policy staff_notifications_select on public.staff_notifications
  for select to authenticated
  using (
    (recipient_role = 'reception' and private.is_reception())
    or (
      recipient_role = 'doctor'
      and private.is_doctor()
      and doctor_id = private.current_doctor_id()
    )
  );

-- No INSERT/UPDATE/DELETE policy exists: rows are written only by the
-- SECURITY DEFINER trigger + RPCs below.

-- ---------------------------------------------------------------------------
-- Insert helper (private; never exposed via PostgREST).
-- ---------------------------------------------------------------------------
create or replace function private.notify_staff(
  p_recipient_role text,
  p_doctor_id      uuid,
  p_type           text,
  p_title          text,
  p_message        text,
  p_appointment_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_notifications
    (recipient_role, doctor_id, type, title, message, related_appointment_id)
  values
    (p_recipient_role, p_doctor_id, p_type, p_title, p_message, p_appointment_id);
end;
$$;

revoke all on function private.notify_staff(text, uuid, text, text, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Appointment → staff feed trigger. SEPARATE from tg_notify_appointment so the
-- patient feed keeps working exactly as before. Operational text only.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_staff_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_date text := to_char(new.appointment_date, 'DD Mon YYYY');
  v_time text := to_char((new.appointment_date + new.appointment_time), 'HH12:MI AM');
begin
  select coalesce(p.preferred_name, p.full_name, 'A patient')
    into v_name
  from public.profiles p where p.id = new.patient_id;
  v_name := coalesce(v_name, 'A patient');

  if tg_op = 'INSERT' then
    perform private.notify_staff('reception', null, 'appointment_booked',
      'New appointment booked',
      v_name || ' is booked for ' || v_date || ' at ' || v_time || ' (ref ' || new.reference || ').',
      new.id);
    perform private.notify_staff('doctor', new.doctor_id, 'appointment_booked',
      'New appointment on your schedule',
      v_name || ' — ' || v_date || ' at ' || v_time || ' (ref ' || new.reference || ').',
      new.id);
    return new;
  end if;

  -- UPDATE: react to the operational transitions the two roles care about.
  if new.status = 'cancelled' and old.status is distinct from new.status then
    perform private.notify_staff('reception', null, 'appointment_cancelled',
      'Appointment cancelled',
      v_name || '''s appointment (ref ' || new.reference || ') was cancelled.', new.id);
    perform private.notify_staff('doctor', new.doctor_id, 'appointment_cancelled',
      'Appointment cancelled',
      v_name || '''s appointment (ref ' || new.reference || ') was cancelled.', new.id);

  elsif new.status = 'no_show' and old.status is distinct from new.status then
    perform private.notify_staff('reception', null, 'appointment_no_show',
      'Marked as no-show',
      v_name || ' (ref ' || new.reference || ') was recorded as not attended.', new.id);

  elsif new.status = 'checked_in' and old.status is distinct from new.status then
    perform private.notify_staff('reception', null, 'appointment_checked_in',
      'Patient checked in',
      v_name || ' has checked in (ref ' || new.reference || ').', new.id);
    perform private.notify_staff('doctor', new.doctor_id, 'appointment_checked_in',
      'Patient ready for you',
      v_name || ' has checked in and is in the queue (ref ' || new.reference || ').', new.id);

  elsif new.status = 'completed' and old.status is distinct from new.status then
    perform private.notify_staff('reception', null, 'appointment_completed',
      'Ready for checkout',
      v_name || '''s consultation is complete (ref ' || new.reference || '). Ready to check out.', new.id);

  elsif (new.appointment_date is distinct from old.appointment_date
         or new.appointment_time is distinct from old.appointment_time)
        and new.status is not distinct from old.status then
    perform private.notify_staff('reception', null, 'appointment_rescheduled',
      'Appointment rescheduled',
      v_name || '''s appointment (ref ' || new.reference || ') is now ' || v_date || ' at ' || v_time || '.', new.id);
    perform private.notify_staff('doctor', new.doctor_id, 'appointment_rescheduled',
      'Appointment rescheduled',
      v_name || '''s appointment (ref ' || new.reference || ') is now ' || v_date || ' at ' || v_time || '.', new.id);
  end if;

  return new;
end;
$$;

revoke all on function public.tg_notify_staff_appointment() from public, anon;

drop trigger if exists trg_notify_staff_appointment_ins on public.appointments;
create trigger trg_notify_staff_appointment_ins
  after insert on public.appointments
  for each row execute function public.tg_notify_staff_appointment();

drop trigger if exists trg_notify_staff_appointment_upd on public.appointments;
create trigger trg_notify_staff_appointment_upd
  after update on public.appointments
  for each row execute function public.tg_notify_staff_appointment();

-- ---------------------------------------------------------------------------
-- Mark-read RPCs. Each caller may only touch rows the SELECT policy would let
-- them read: a receptionist the shared reception feed, a doctor their own rows.
-- ---------------------------------------------------------------------------
create or replace function public.staff_mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if private.is_reception() then
    update public.staff_notifications
       set is_read = true, read_at = now()
     where id = p_id and recipient_role = 'reception' and not is_read;
  elsif private.is_doctor() then
    v_doctor := private.current_doctor_id();
    update public.staff_notifications
       set is_read = true, read_at = now()
     where id = p_id and recipient_role = 'doctor' and doctor_id = v_doctor and not is_read;
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.staff_mark_all_notifications_read()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if private.is_reception() then
    update public.staff_notifications
       set is_read = true, read_at = now()
     where recipient_role = 'reception' and not is_read;
  elsif private.is_doctor() then
    v_doctor := private.current_doctor_id();
    update public.staff_notifications
       set is_read = true, read_at = now()
     where recipient_role = 'doctor' and doctor_id = v_doctor and not is_read;
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

-- Realtime: staff dashboards + bells refresh live. RLS still scopes each client.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'staff_notifications'
    ) then
      alter publication supabase_realtime add table public.staff_notifications;
    end if;
  end if;
end $$;

-- ===========================================================================
-- 2. DOCTOR AVAILABILITY MANAGEMENT
--    A doctor manages ONLY their own future availability, and can never touch
--    a slot that already holds a (non-cancelled) appointment. Changes flow
--    straight into the same public.doctor_availability the patient booking RPCs
--    read, so a new slot is immediately bookable and a disabled one immediately
--    disappears from get_available_slots.
-- ===========================================================================

-- Read the doctor's own availability for a date window, with a booked flag so
-- the UI can show booked vs free without ever seeing patient identity.
create or replace function public.doctor_list_availability(
  p_from date,
  p_to   date
)
returns table (
  availability_id uuid,
  available_date  date,
  start_time      time,
  is_active       boolean,
  is_booked       boolean
)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_doctor uuid := private.current_doctor_id();
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  return query
    select da.id, da.available_date, da.start_time, da.is_active,
           exists (
             select 1 from public.appointments a
             where a.doctor_id = da.doctor_id
               and a.appointment_date = da.available_date
               and a.appointment_time = da.start_time
               and a.status <> 'cancelled'
           )
    from public.doctor_availability da
    where da.doctor_id = v_doctor
      and da.available_date between p_from and p_to
    order by da.available_date, da.start_time;
end;
$$;

-- Add a single future slot (or re-enable one previously disabled).
create or replace function public.doctor_add_availability(
  p_date       date,
  p_start_time time
)
returns table (availability_id uuid, available_date date, start_time time, is_active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_id     uuid;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;
  if p_date is null or p_start_time is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_date < current_date then
    raise exception 'date_in_past' using errcode = '22023';
  end if;

  insert into public.doctor_availability
    (doctor_id, available_date, start_time, is_active, is_demo, source_label)
  values
    (v_doctor, p_date, p_start_time, true, false, 'Doctor-managed availability')
  on conflict (doctor_id, available_date, start_time)
    do update set is_active = true
  returning id into v_id;

  return query
    select da.id, da.available_date, da.start_time, da.is_active
    from public.doctor_availability da where da.id = v_id;
end;
$$;

-- Enable or disable one of the doctor's own slots. A booked slot can never be
-- disabled (the appointment is protected); it is left exactly as it was.
create or replace function public.doctor_set_availability_active(
  p_availability_id uuid,
  p_active          boolean
)
returns table (availability_id uuid, is_active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_date   date;
  v_time   time;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;

  select da.available_date, da.start_time into v_date, v_time
  from public.doctor_availability da
  where da.id = p_availability_id and da.doctor_id = v_doctor
  for update;
  if not found then
    raise exception 'availability_not_found' using errcode = 'P0002';
  end if;
  if v_date < current_date then
    raise exception 'date_in_past' using errcode = '22023';
  end if;

  if p_active is false and exists (
    select 1 from public.appointments a
    where a.doctor_id = v_doctor
      and a.appointment_date = v_date
      and a.appointment_time = v_time
      and a.status <> 'cancelled'
  ) then
    raise exception 'slot_booked' using errcode = '42501';
  end if;

  update public.doctor_availability
     set is_active = p_active
   where id = p_availability_id;

  return query select p_availability_id, p_active;
end;
$$;

-- Block a future time range for leave/meetings: disable every unbooked, active
-- slot on that date whose start falls in [p_start_time, p_end_time). Booked
-- slots are skipped, never cancelled.
create or replace function public.doctor_block_availability(
  p_date       date,
  p_start_time time,
  p_end_time   time
)
returns table (blocked_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_count  integer;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;
  if p_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_date < current_date then
    raise exception 'date_in_past' using errcode = '22023';
  end if;

  update public.doctor_availability da
     set is_active = false
   where da.doctor_id = v_doctor
     and da.available_date = p_date
     and da.start_time >= p_start_time
     and da.start_time < p_end_time
     and da.is_active
     and not exists (
       select 1 from public.appointments a
       where a.doctor_id = v_doctor
         and a.appointment_date = da.available_date
         and a.appointment_time = da.start_time
         and a.status <> 'cancelled'
     );
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- ===========================================================================
-- 3. RECEPTION-ASSISTED BOOKING
--    Reception books INTO the same appointments model patients use, for a
--    permitted patient it selects. The patient_id is validated server-side; a
--    receptionist can never book on behalf of a non-patient account.
-- ===========================================================================

-- Patient lookup for the booking picker + patient directory. Returns ONLY
-- patient-role profiles, and only operational contact fields.
create or replace function public.staff_search_patients(p_query text)
returns table (patient_id uuid, full_name text, preferred_name text, phone text)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  perform private.require_staff('reception');
  if char_length(v_q) < 2 then
    return; -- require a real search term; never dump the whole patient list
  end if;

  return query
    select p.id, p.full_name, p.preferred_name, p.phone
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role::text = 'patient'
    where p.full_name ilike '%' || v_q || '%'
       or p.preferred_name ilike '%' || v_q || '%'
       or p.phone ilike '%' || v_q || '%'
    order by coalesce(p.full_name, p.preferred_name)
    limit 20;
end;
$$;

-- Available slots for a doctor+service, callable by reception (mirrors the
-- patient get_available_slots_v2 exactly, but gated on the reception role).
create or replace function public.staff_get_available_slots(
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
language plpgsql security definer set search_path = '' stable as $$
begin
  perform private.require_staff('reception');
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'invalid_doctor' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.is_active) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.doctor_services ds
    where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id
  ) then
    raise exception 'service_not_offered' using errcode = '22023';
  end if;

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

-- Create an appointment for a chosen patient. Same server-derived reference,
-- same double-booking guard, same downstream triggers (patient + staff feeds)
-- as public.create_patient_appointment.
create or replace function public.staff_create_appointment(
  p_patient_id      uuid,
  p_doctor_id       uuid,
  p_service_id      uuid,
  p_availability_id uuid,
  p_patient_notes   text default null
)
returns table (reference text, appointment_date date, appointment_time time, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_date    date;
  v_time    time;
  v_ref     text;
  v_appt_id uuid;
begin
  perform private.require_staff('reception');

  if p_patient_notes is not null and char_length(p_patient_notes) > 2000 then
    raise exception 'notes_too_long' using errcode = '22001';
  end if;

  -- Patient must exist AND actually hold the patient role.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_patient_id and ur.role::text = 'patient'
  ) then
    raise exception 'invalid_patient' using errcode = '22023';
  end if;
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'invalid_doctor' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.is_active) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.doctor_services ds
    where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id
  ) then
    raise exception 'service_not_offered' using errcode = '22023';
  end if;

  select da.available_date, da.start_time into v_date, v_time
  from public.doctor_availability da
  where da.id = p_availability_id
    and da.doctor_id = p_doctor_id
    and da.is_active
    and da.available_date >= current_date;
  if not found then
    raise exception 'invalid_availability' using errcode = '22023';
  end if;

  v_ref := 'REF-' || to_char(now(), 'YYYY') || '-'
           || lpad(nextval('public.appointment_ref_seq')::text, 6, '0');

  insert into public.appointments (
    reference, patient_id, doctor_id, service_id,
    appointment_date, appointment_time, status, patient_notes
  )
  values (
    v_ref, p_patient_id, p_doctor_id, p_service_id,
    v_date, v_time, 'scheduled',
    nullif(btrim(coalesce(p_patient_notes, '')), '')
  )
  returning id into v_appt_id;

  return query
    select a.reference, a.appointment_date, a.appointment_time, a.status::text
    from public.appointments a where a.id = v_appt_id;

exception
  when unique_violation then
    raise exception 'slot_unavailable' using errcode = '23505';
end;
$$;

-- ===========================================================================
-- 4. GRANTS — revoke from public/anon, grant execute to authenticated. The
--    role re-check inside each function is the real gate.
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.staff_mark_notification_read(uuid)',
    'public.staff_mark_all_notifications_read()',
    'public.doctor_list_availability(date, date)',
    'public.doctor_add_availability(date, time)',
    'public.doctor_set_availability_active(uuid, boolean)',
    'public.doctor_block_availability(date, time, time)',
    'public.staff_search_patients(text)',
    'public.staff_get_available_slots(uuid, uuid)',
    'public.staff_create_appointment(uuid, uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

commit;
