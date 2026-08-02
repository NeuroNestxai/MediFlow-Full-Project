-- =============================================================================
-- MediFlow AI — Patient rescheduling
-- Migration: 20260802000004_add_patient_rescheduling  (ADDITIVE, IDEMPOTENT)
--
-- Adds a secure RPC public.reschedule_patient_appointment that atomically moves
-- an appointment to a new availability slot for the SAME doctor, preserving the
-- appointment id + booking reference, and records the change in history.
--
-- The existing appointment_status_history only records status transitions
-- (status, changed_by, changed_at) and cannot represent a date/time move, so
-- this migration makes the SMALLEST additive history change: an event_type plus
-- nullable previous/new date+time columns. Existing rows keep the defaults; the
-- existing appointments_log_status trigger (which only fires on status change)
-- is unaffected.
--
-- SAFETY: single transaction; additive only (no drops, no deletes, no data
-- rewrite). SECURITY DEFINER with search_path = '' and fully-qualified names;
-- revoked from public/anon; granted only to authenticated. Row locks prevent
-- races; the existing partial unique index enforces double-booking atomically.
-- Cannot touch unrelated appointments (filtered by id + patient_id = auth.uid()).
-- =============================================================================

begin;

-- Smallest additive history change to represent a reschedule event.
alter table public.appointment_status_history
  add column if not exists event_type     text not null default 'status_change',
  add column if not exists previous_date   date,
  add column if not exists previous_time   time,
  add column if not exists new_date        date,
  add column if not exists new_time        time;

create or replace function public.reschedule_patient_appointment(
  p_appointment_id  uuid,
  p_availability_id uuid
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
  v_uid      uuid := auth.uid();
  v_status   public.appointment_status;
  v_doctor   uuid;
  v_service  uuid;
  v_ref      text;
  v_old_date date;
  v_old_time time;
  v_new_date date;
  v_new_time time;
begin
  -- 1. Authenticated patient only (role from user_roles, not metadata).
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 2. Lock + load the appointment; must belong to the caller.
  select a.status, a.doctor_id, a.service_id, a.reference, a.appointment_date, a.appointment_time
    into v_status, v_doctor, v_service, v_ref, v_old_date, v_old_time
  from public.appointments a
  where a.id = p_appointment_id
    and a.patient_id = v_uid
  for update;
  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  -- 3. Only reschedule from safe statuses (not cancelled/checked_in/completed).
  if v_status not in ('scheduled', 'confirmed') then
    raise exception 'appointment_not_reschedulable' using errcode = '42501';
  end if;

  -- 4. Lock + load the requested availability row.
  select da.available_date, da.start_time
    into v_new_date, v_new_time
  from public.doctor_availability da
  where da.id = p_availability_id
  for update;
  if not found then
    raise exception 'availability_not_found' using errcode = 'P0002';
  end if;

  -- 5. Availability must belong to the same doctor, be active, and be future.
  if not exists (
    select 1 from public.doctor_availability da
    where da.id = p_availability_id
      and da.doctor_id = v_doctor
      and da.is_active
      and da.available_date >= current_date
  ) then
    raise exception 'invalid_availability' using errcode = '22023';
  end if;

  -- 6. The appointment's service must still be mapped to the doctor.
  if not exists (
    select 1 from public.doctor_services ds
    where ds.doctor_id = v_doctor and ds.service_id = v_service
  ) then
    raise exception 'invalid_availability' using errcode = '22023';
  end if;

  -- 7. Reject a slot already held by another non-cancelled appointment.
  if exists (
    select 1 from public.appointments a2
    where a2.doctor_id = v_doctor
      and a2.appointment_date = v_new_date
      and a2.appointment_time = v_new_time
      and a2.status <> 'cancelled'
      and a2.id <> p_appointment_id
  ) then
    raise exception 'slot_unavailable' using errcode = '23505';
  end if;

  -- 8. Atomic move: same id + reference; the partial unique index guards races.
  --    Freeing the old slot is an automatic consequence of this single update.
  update public.appointments
     set appointment_date = v_new_date,
         appointment_time = v_new_time
   where id = p_appointment_id;

  -- 9. Append a reschedule history event (status is preserved, not changed).
  insert into public.appointment_status_history
    (appointment_id, status, changed_by, event_type, previous_date, previous_time, new_date, new_time)
  values
    (p_appointment_id, v_status, v_uid, 'rescheduled', v_old_date, v_old_time, v_new_date, v_new_time);

  -- 10. Return only what the frontend needs (no internal IDs).
  return query
    select a.reference, a.appointment_date, a.appointment_time, a.status::text
    from public.appointments a
    where a.id = p_appointment_id;

exception
  when unique_violation then
    raise exception 'slot_unavailable' using errcode = '23505';
end;
$$;

revoke all on function public.reschedule_patient_appointment(uuid, uuid) from public;
revoke all on function public.reschedule_patient_appointment(uuid, uuid) from anon;
grant execute on function public.reschedule_patient_appointment(uuid, uuid) to authenticated;

commit;
