-- =============================================================================
-- MediFlow AI — Security hardening 06: human-in-the-loop appointment approval
-- Migration: 20260811153139_sec_06_appointment_approval_flow  (IDEMPOTENT)
--
-- Req 6: patient bookings now enter as 'pending_approval'. Only admin can
--        approve (approve_appointment), which flips to 'scheduled', records
--        approved_by/at, and enqueues a Gmail confirmation to email_outbox.
-- =============================================================================

begin;

-- ---- 6a. Approval audit columns + default state ----
alter table public.appointments
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.appointments
  alter column status set default 'pending_approval'::public.appointment_status;

-- ---- 6b. Admin visibility (review the approval queue) ----
drop policy if exists appointments_select_admin on public.appointments;
create policy appointments_select_admin on public.appointments
  for select to authenticated
  using ( private.is_admin() );

drop policy if exists ash_select_admin on public.appointment_status_history;
create policy ash_select_admin on public.appointment_status_history
  for select to authenticated
  using ( private.is_admin() );

-- ---- 6c. Patient bookings enter as pending_approval ----
create or replace function public.create_patient_appointment(
  p_doctor_id uuid, p_service_id uuid, p_availability_id uuid, p_patient_notes text default null::text)
returns table(reference text, appointment_date date, appointment_time time without time zone, status text)
language plpgsql security definer set search_path to '' as $function$
declare
  v_uid     uuid := auth.uid();
  v_date    date;
  v_time    time;
  v_ref     text;
  v_appt_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode = '42501'; end if;

  if p_patient_notes is not null and char_length(p_patient_notes) > 2000 then
    raise exception 'notes_too_long' using errcode = '22001';
  end if;

  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'invalid_doctor' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.is_active) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  if not exists (select 1 from public.doctor_services ds
                 where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id) then
    raise exception 'service_not_offered' using errcode = '22023';
  end if;

  select da.available_date, da.start_time into v_date, v_time
  from public.doctor_availability da
  where da.id = p_availability_id and da.doctor_id = p_doctor_id
    and da.is_active and da.available_date >= current_date;
  if not found then raise exception 'invalid_availability' using errcode = '22023'; end if;

  v_ref := 'REF-' || to_char(now(), 'YYYY') || '-'
           || lpad(nextval('public.appointment_ref_seq')::text, 6, '0');

  insert into public.appointments (
    reference, patient_id, doctor_id, service_id,
    appointment_date, appointment_time, status, patient_notes
  )
  values (
    v_ref, v_uid, p_doctor_id, p_service_id,
    v_date, v_time, 'pending_approval',
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
$function$;

-- ---- 6d. Admin-only approval RPC: scheduled + enqueue Gmail confirmation ----
create or replace function public.approve_appointment(p_appointment_id uuid)
returns table(reference text, status text, approved_at timestamptz)
language plpgsql volatile security definer set search_path to '' as $function$
declare
  v_uid   uuid := auth.uid();
  v_row   public.appointments;
  v_email text;
  v_date  text;
  v_time  text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending_approval' then
    raise exception 'not_pending_approval' using errcode = '22023';
  end if;

  update public.appointments
     set status = 'scheduled', approved_by = v_uid, approved_at = now()
   where id = p_appointment_id
   returning * into v_row;

  select p.email into v_email from public.patients p where p.user_id = v_row.patient_id;
  v_date := to_char(v_row.appointment_date, 'DD Mon YYYY');
  v_time := to_char((v_row.appointment_date + v_row.appointment_time), 'HH12:MI AM');

  if v_email is not null then
    insert into public.email_outbox (to_email, subject, body, template, related_appointment_id)
    values (
      v_email,
      'Your MediFlow appointment is confirmed (' || v_row.reference || ')',
      'Good news - your appointment (ref ' || v_row.reference || ') has been confirmed for '
        || v_date || ' at ' || v_time || '. Please arrive 10 minutes early.' || chr(10)
        || 'MediFlow / MCC Clinic',
      'appointment_confirmed',
      v_row.id
    );
  end if;

  return query select v_row.reference, v_row.status::text, v_row.approved_at;
end;
$function$;

revoke all on function public.approve_appointment(uuid) from public, anon;
grant execute on function public.approve_appointment(uuid) to authenticated;

-- ---- 6e. In-app notifications for the new states ----
create or replace function public.tg_notify_appointment()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  v_date text := to_char(new.appointment_date, 'DD Mon YYYY');
  v_time text := to_char((new.appointment_date + new.appointment_time), 'HH12:MI AM');
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending_approval' then
      insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
      values (new.patient_id, 'appointment_requested', 'Request received',
              'Your appointment request (ref ' || new.reference || ') for ' || v_date || ' at ' || v_time
              || ' has been received and is awaiting confirmation.', new.id);
    else
      insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
      values (new.patient_id, 'appointment_booked', 'Appointment booked',
              'Your appointment (ref ' || new.reference || ') is booked for ' || v_date || ' at ' || v_time || '.',
              new.id);
    end if;
    return new;
  end if;

  if new.status = 'scheduled' and old.status = 'pending_approval' then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_confirmed', 'Appointment confirmed',
            'Your appointment (ref ' || new.reference || ') for ' || v_date || ' at ' || v_time
            || ' has been confirmed.', new.id);
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_cancelled', 'Appointment cancelled',
            'Your appointment (ref ' || new.reference || ') has been cancelled.', new.id);
  elsif new.status = 'checked_in' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_checked_in', 'Checked in',
            'You are checked in for your appointment (ref ' || new.reference || ').', new.id);
  elsif new.status = 'completed' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_completed', 'Visit complete',
            'Your visit (ref ' || new.reference || ') is complete. Please see reception to check out.', new.id);
  elsif new.status = 'checked_out' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_checked_out', 'Checked out',
            'You are checked out for your appointment (ref ' || new.reference || '). Thank you for visiting MCC Clinic.', new.id);
  elsif new.status = 'no_show' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_no_show', 'Appointment missed',
            'Your appointment (ref ' || new.reference || ') was recorded as not attended.', new.id);
  elsif (new.appointment_date is distinct from old.appointment_date
         or new.appointment_time is distinct from old.appointment_time)
        and new.status is not distinct from old.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_rescheduled', 'Appointment rescheduled',
            'Your appointment (ref ' || new.reference || ') is now ' || v_date || ' at ' || v_time || '.', new.id);
  end if;
  return new;
end;
$function$;
revoke execute on function public.tg_notify_appointment() from public, anon, authenticated;

commit;
