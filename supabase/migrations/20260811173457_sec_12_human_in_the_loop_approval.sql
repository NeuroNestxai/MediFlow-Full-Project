-- =============================================================================
-- MediFlow AI — Human-in-the-loop appointment approval
-- Migration: 20260811173457_sec_12_human_in_the_loop_approval  (IDEMPOTENT)
--
-- Every new appointment is FORCED into pending_approval on insert (no path can
-- create a finalized appointment). Admin OR reception then approve() -> scheduled
-- (+ detailed Gmail confirmation) or reject() -> rejected (+ reason + Gmail).
-- Patient sees the decision + reason on their dashboard. No-show handling is
-- unchanged (doctor_mark_no_show / staff_update_queue_status) — see
-- supabase/HUMAN_IN_THE_LOOP.md.
-- =============================================================================

begin;

alter table public.appointments
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) <= 1000);

-- HARD guarantee: every newly created appointment starts in pending_approval,
-- regardless of who inserts it or what status they pass. Only approve_appointment()
-- can move it to 'scheduled'.
create or replace function public.appointments_force_pending()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.status := 'pending_approval';
  new.approved_by := null; new.approved_at := null;
  new.rejected_by := null; new.rejected_at := null; new.rejection_reason := null;
  return new;
end;
$$;
revoke execute on function public.appointments_force_pending() from public, anon, authenticated;

drop trigger if exists trg_appointments_force_pending on public.appointments;
create trigger trg_appointments_force_pending
  before insert on public.appointments
  for each row execute function public.appointments_force_pending();

-- APPROVE (admin OR reception) -> scheduled + detailed Gmail confirmation
create or replace function public.approve_appointment(p_appointment_id uuid)
returns table(reference text, status text, approved_at timestamptz)
language plpgsql volatile security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.appointments;
  v_email text; v_doctor text; v_service text; v_date text; v_time text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
  if v_row.status <> 'pending_approval' then
    raise exception 'not_pending_approval' using errcode='22023';
  end if;

  update public.appointments
     set status='scheduled', approved_by=v_uid, approved_at=now(),
         rejected_by=null, rejected_at=null, rejection_reason=null
   where id = p_appointment_id returning * into v_row;

  select p.email, d.full_name, s.name into v_email, v_doctor, v_service
  from public.patients p
  left join public.doctors  d on d.id = v_row.doctor_id
  left join public.services s on s.id = v_row.service_id
  where p.user_id = v_row.patient_id;

  v_date := to_char(v_row.appointment_date, 'DD Mon YYYY');
  v_time := to_char((v_row.appointment_date + v_row.appointment_time), 'HH12:MI AM');

  if v_email is not null then
    insert into public.email_outbox (to_email, subject, body, template, related_appointment_id)
    values (v_email,
      'Your MediFlow appointment is confirmed (' || v_row.reference || ')',
      'Hello,' || chr(10) || chr(10) ||
      'Your appointment request has been APPROVED and confirmed. Details:' || chr(10) ||
      '- Reference: ' || v_row.reference || chr(10) ||
      '- Date: ' || v_date || chr(10) ||
      '- Time: ' || v_time || chr(10) ||
      '- Doctor: ' || coalesce(v_doctor, 'To be assigned') || chr(10) ||
      '- Service: ' || coalesce(v_service, '-') || chr(10) || chr(10) ||
      'Please arrive 10 minutes early and bring your booking reference.' || chr(10) ||
      'MediFlow / MCC Clinic',
      'appointment_confirmed', v_row.id);
  end if;

  return query select v_row.reference, v_row.status::text, v_row.approved_at;
end;
$function$;
revoke all on function public.approve_appointment(uuid) from public, anon;
grant execute on function public.approve_appointment(uuid) to authenticated;

-- REJECT (admin OR reception) -> rejected + reason + Gmail notification
create or replace function public.reject_appointment(p_appointment_id uuid, p_reason text default null)
returns table(reference text, status text, rejected_at timestamptz)
language plpgsql volatile security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.appointments;
  v_email text; v_date text; v_time text;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode='22001';
  end if;

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
  if v_row.status <> 'pending_approval' then
    raise exception 'not_pending_approval' using errcode='22023';
  end if;

  update public.appointments
     set status='rejected', rejected_by=v_uid, rejected_at=now(), rejection_reason=v_reason,
         approved_by=null, approved_at=null
   where id = p_appointment_id returning * into v_row;

  select p.email into v_email from public.patients p where p.user_id = v_row.patient_id;
  v_date := to_char(v_row.appointment_date, 'DD Mon YYYY');
  v_time := to_char((v_row.appointment_date + v_row.appointment_time), 'HH12:MI AM');

  if v_email is not null then
    insert into public.email_outbox (to_email, subject, body, template, related_appointment_id)
    values (v_email,
      'Update on your MediFlow appointment request (' || v_row.reference || ')',
      'Hello,' || chr(10) || chr(10) ||
      'We are sorry to inform you that your appointment request could not be approved.' || chr(10) ||
      '- Reference: ' || v_row.reference || chr(10) ||
      '- Requested: ' || v_date || ' at ' || v_time || chr(10) ||
      case when v_reason is not null then '- Reason: ' || v_reason || chr(10) else '' end || chr(10) ||
      'Please book another slot or contact the clinic for assistance.' || chr(10) ||
      'MediFlow / MCC Clinic',
      'appointment_rejected', v_row.id);
  end if;

  return query select v_row.reference, v_row.status::text, v_row.rejected_at;
end;
$function$;
revoke all on function public.reject_appointment(uuid, text) from public, anon;
grant execute on function public.reject_appointment(uuid, text) to authenticated;

-- Notifications: recreate with the 'rejected' branch added
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
              'Your appointment (ref ' || new.reference || ') is booked for ' || v_date || ' at ' || v_time || '.', new.id);
    end if;
    return new;
  end if;

  if new.status = 'scheduled' and old.status = 'pending_approval' then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_confirmed', 'Appointment confirmed',
            'Your appointment (ref ' || new.reference || ') for ' || v_date || ' at ' || v_time
            || ' has been confirmed.', new.id);
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_rejected', 'Request not approved',
            'Your appointment request (ref ' || new.reference || ') for ' || v_date || ' at ' || v_time
            || ' was not approved.' || coalesce(' Reason: ' || new.rejection_reason, ''), new.id);
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

-- Patient dashboard: show the decision + reason
create or replace view public.dashboard_patient_appointments
with (security_invoker = true) as
select a.reference, a.patient_ref as patient_id, a.appointment_date, a.appointment_time,
       a.status::text as status, s.name as service_name, d.full_name as doctor_name,
       a.approved_at, a.rejected_at, a.rejection_reason
from public.appointments a
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where a.patient_id = (select auth.uid()) and private.is_patient();
grant select on public.dashboard_patient_appointments to authenticated;

-- Admin + reception pending-approval queue
create or replace view public.dashboard_pending_approvals
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       pt.full_name, a.appointment_date, a.appointment_time,
       s.name as service_name, d.full_name as doctor_name, a.created_at
from public.appointments a
join public.patients pt on pt.user_id = a.patient_id
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where (private.is_admin() or private.is_reception()) and a.status = 'pending_approval';
grant select on public.dashboard_pending_approvals to authenticated;

commit;
