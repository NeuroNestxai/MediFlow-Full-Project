-- =============================================================================
-- MediFlow AI — Staff state-transition RPCs + live updates
-- Migration: 20260803000003_staff_transition_rpcs  (ADDITIVE, IDEMPOTENT)
--
-- The ONLY way Reception or a Doctor may change an appointment. Mirrors the
-- patient booking slice exactly: SECURITY DEFINER, search_path = '', the actor
-- re-derived from auth.uid(), the role re-checked from public.user_roles, row
-- locked FOR UPDATE, named errors with stable errcodes, minimal return rows.
--
-- Allowed transitions (operational only — no clinical meaning):
--   Reception : scheduled|confirmed → checked_in
--               checked_in          → waiting
--               scheduled|confirmed|checked_in|waiting → no_show
--               completed           → checked_out
--   Doctor    : checked_in|waiting  → in_consultation
--               in_consultation     → completed
--               checked_in|waiting  → no_show
--
-- Every RPC is idempotent-safe: re-running a transition that already happened
-- raises a named error rather than corrupting state, so a double QR scan or a
-- double-click can never skip a step.
-- =============================================================================

begin;

-- ===========================================================================
-- SHARED GUARD
-- ===========================================================================
create or replace function private.require_staff(p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_role = 'reception' and not private.is_reception() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_role = 'doctor' and not private.is_doctor() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_staff(text) from public, anon;
grant execute on function private.require_staff(text) to authenticated;

-- ===========================================================================
-- RECEPTION — QR / manual reference lookup
-- Returns everything the check-in verification card shows. Operational only:
-- deliberately returns NO clinical data (no notes, allergies or medications).
-- ===========================================================================
create or replace function public.staff_lookup_appointment(p_reference text)
returns table (
  appointment_id    uuid,
  reference         text,
  patient_name      text,
  patient_phone     text,
  doctor_name       text,
  doctor_palette    smallint,
  service_name      text,
  appointment_date  date,
  appointment_time  time,
  status            text,
  can_check_in      boolean,
  can_check_out     boolean
)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_ref text := upper(trim(coalesce(p_reference, '')));
begin
  perform private.require_staff('reception');

  if v_ref = '' or char_length(v_ref) > 64 then
    raise exception 'invalid_reference' using errcode = '22023';
  end if;

  return query
  select a.id,
         a.reference,
         coalesce(p.preferred_name, p.full_name, 'Patient'),
         p.phone,
         d.full_name,
         d.portrait_palette,
         s.name,
         a.appointment_date,
         a.appointment_time,
         a.status::text,
         a.status in ('scheduled', 'confirmed'),
         a.status = 'completed'
  from public.appointments a
  join public.doctors  d on d.id = a.doctor_id
  join public.services s on s.id = a.service_id
  left join public.profiles p on p.id = a.patient_id
  where a.reference = v_ref;
end;
$$;

-- ===========================================================================
-- RECEPTION — check in (after identity confirmation in the UI)
-- ===========================================================================
create or replace function public.staff_check_in_appointment(p_appointment_id uuid)
returns table (reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.appointment_status;
  v_ref    text;
begin
  perform private.require_staff('reception');

  select a.status, a.reference into v_status, v_ref
  from public.appointments a where a.id = p_appointment_id for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('scheduled', 'confirmed') then
    raise exception 'not_checkinable' using errcode = '42501';
  end if;

  update public.appointments set status = 'checked_in' where id = p_appointment_id;
  return query select v_ref, 'checked_in'::text;
end;
$$;

-- ===========================================================================
-- RECEPTION — move through the live queue / mark no-show
-- ===========================================================================
create or replace function public.staff_update_queue_status(
  p_appointment_id uuid,
  p_status         text
)
returns table (reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.appointment_status;
  v_ref    text;
begin
  perform private.require_staff('reception');

  if p_status not in ('waiting', 'no_show') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select a.status, a.reference into v_status, v_ref
  from public.appointments a where a.id = p_appointment_id for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  if p_status = 'waiting' and v_status <> 'checked_in' then
    raise exception 'invalid_transition' using errcode = '42501';
  end if;
  if p_status = 'no_show'
     and v_status not in ('scheduled', 'confirmed', 'checked_in', 'waiting') then
    raise exception 'invalid_transition' using errcode = '42501';
  end if;

  update public.appointments
     set status = p_status::public.appointment_status
   where id = p_appointment_id;

  return query select v_ref, p_status;
end;
$$;

-- ===========================================================================
-- RECEPTION — check out (second QR scan; consultation must be complete)
-- ===========================================================================
create or replace function public.staff_check_out_appointment(p_appointment_id uuid)
returns table (reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.appointment_status;
  v_ref    text;
begin
  perform private.require_staff('reception');

  select a.status, a.reference into v_status, v_ref
  from public.appointments a where a.id = p_appointment_id for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'completed' then
    raise exception 'not_checkoutable' using errcode = '42501';
  end if;

  update public.appointments set status = 'checked_out' where id = p_appointment_id;
  return query select v_ref, 'checked_out'::text;
end;
$$;

-- ===========================================================================
-- DOCTOR — start a consultation (creates or reopens the draft note)
-- ===========================================================================
create or replace function public.doctor_start_consultation(p_appointment_id uuid)
returns table (consultation_id uuid, reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_status public.appointment_status;
  v_ref    text;
  v_cid    uuid;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;

  select a.status, a.reference into v_status, v_ref
  from public.appointments a
  where a.id = p_appointment_id and a.doctor_id = v_doctor
  for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('checked_in', 'waiting', 'in_consultation') then
    raise exception 'not_startable' using errcode = '42501';
  end if;

  insert into public.consultations (appointment_id, doctor_id)
  values (p_appointment_id, v_doctor)
  on conflict (appointment_id) do update set updated_at = now()
  returning id into v_cid;

  if v_status <> 'in_consultation' then
    update public.appointments set status = 'in_consultation' where id = p_appointment_id;
  end if;

  return query select v_cid, v_ref, 'in_consultation'::text;
end;
$$;

-- ===========================================================================
-- DOCTOR — autosave consultation notes (draft only)
-- ===========================================================================
create or replace function public.doctor_save_consultation_notes(
  p_appointment_id uuid,
  p_notes          text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;
  if p_notes is not null and char_length(p_notes) > 20000 then
    raise exception 'notes_too_long' using errcode = '22001';
  end if;

  update public.consultations
     set notes = p_notes
   where appointment_id = p_appointment_id
     and doctor_id = v_doctor
     and status = 'draft';

  if not found then
    raise exception 'consultation_not_editable' using errcode = '42501';
  end if;
end;
$$;

-- ===========================================================================
-- DOCTOR — complete the consultation (doctor approval; not auto-reversible)
-- ===========================================================================
create or replace function public.doctor_complete_consultation(p_appointment_id uuid)
returns table (reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_status public.appointment_status;
  v_ref    text;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;

  select a.status, a.reference into v_status, v_ref
  from public.appointments a
  where a.id = p_appointment_id and a.doctor_id = v_doctor
  for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_consultation' then
    raise exception 'not_completable' using errcode = '42501';
  end if;

  update public.consultations
     set status = 'completed', completed_at = now()
   where appointment_id = p_appointment_id and doctor_id = v_doctor;

  update public.appointments set status = 'completed' where id = p_appointment_id;
  return query select v_ref, 'completed'::text;
end;
$$;

-- ===========================================================================
-- DOCTOR — mark no-show
-- ===========================================================================
create or replace function public.doctor_mark_no_show(p_appointment_id uuid)
returns table (reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := private.current_doctor_id();
  v_status public.appointment_status;
  v_ref    text;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;

  select a.status, a.reference into v_status, v_ref
  from public.appointments a
  where a.id = p_appointment_id and a.doctor_id = v_doctor
  for update;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('scheduled', 'confirmed', 'checked_in', 'waiting') then
    raise exception 'invalid_transition' using errcode = '42501';
  end if;

  update public.appointments set status = 'no_show' where id = p_appointment_id;
  return query select v_ref, 'no_show'::text;
end;
$$;

-- ===========================================================================
-- DOCTOR — create / approve a follow-up
-- `p_approve = false` saves a draft the patient cannot see. Only an explicit
-- approval publishes it, per the "Doctor approval required" product rule.
-- ===========================================================================
create or replace function public.doctor_create_follow_up(
  p_appointment_id           uuid,
  p_follow_up_type           text,
  p_due_date                 date,
  p_instructions             text,
  p_set_reminder             boolean default false,
  p_new_appointment_required boolean default false,
  p_internal_notes           text    default null,
  p_approve                  boolean default false
)
returns table (follow_up_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor  uuid := private.current_doctor_id();
  v_patient uuid;
  v_id      uuid;
  v_status  text := case when p_approve then 'approved' else 'draft' end;
begin
  perform private.require_staff('doctor');
  if v_doctor is null then
    raise exception 'doctor_not_linked' using errcode = '42501';
  end if;

  if p_follow_up_type not in ('recheck', 'test_review', 'medication_review', 'general_check_in') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  if p_instructions is null or char_length(trim(p_instructions)) = 0 then
    raise exception 'instructions_required' using errcode = '22023';
  end if;
  if char_length(p_instructions) > 4000 then
    raise exception 'instructions_too_long' using errcode = '22001';
  end if;
  if p_due_date is null or p_due_date < current_date then
    raise exception 'invalid_due_date' using errcode = '22023';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id and a.doctor_id = v_doctor;

  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  insert into public.follow_ups (
    appointment_id, patient_id, doctor_id, follow_up_type, due_date, instructions,
    set_reminder, new_appointment_required, internal_notes, status, approved_at
  ) values (
    p_appointment_id, v_patient, v_doctor, p_follow_up_type, p_due_date, trim(p_instructions),
    coalesce(p_set_reminder, false), coalesce(p_new_appointment_required, false),
    p_internal_notes, v_status, case when p_approve then now() else null end
  )
  returning id into v_id;

  return query select v_id, v_status;
end;
$$;

-- ===========================================================================
-- GRANTS — revoke from public/anon, then grant execute to authenticated.
-- The role check inside each function is the real gate.
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.staff_lookup_appointment(text)',
    'public.staff_check_in_appointment(uuid)',
    'public.staff_update_queue_status(uuid, text)',
    'public.staff_check_out_appointment(uuid)',
    'public.doctor_start_consultation(uuid)',
    'public.doctor_save_consultation_notes(uuid, text)',
    'public.doctor_complete_consultation(uuid)',
    'public.doctor_mark_no_show(uuid)',
    'public.doctor_create_follow_up(uuid, text, date, text, boolean, boolean, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ===========================================================================
-- PATIENT NOTIFICATIONS — extend for the new states.
-- Replaces the existing function, preserving every original branch.
-- Operational text only — never medical information.
-- ===========================================================================
create or replace function public.tg_notify_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_date text := to_char(new.appointment_date, 'DD Mon YYYY');
  v_time text := to_char((new.appointment_date + new.appointment_time), 'HH12:MI AM');
begin
  if tg_op = 'INSERT' then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_booked', 'Appointment booked',
            'Your appointment (ref ' || new.reference || ') is booked for ' || v_date || ' at ' || v_time || '.',
            new.id);
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from new.status then
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
            'Your appointment (ref ' || new.reference || ') is now ' || v_date || ' at ' || v_time || '.',
            new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.tg_notify_appointment() from public, anon;

-- Follow-up reaches the patient ONLY on approval.
create or replace function public.tg_notify_follow_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'follow_up', 'Follow-up from your doctor',
            'Your doctor has sent follow-up instructions, due ' ||
            to_char(new.due_date, 'DD Mon YYYY') || '. Open Follow-Up to read them.',
            new.appointment_id);
  end if;
  return new;
end;
$$;

revoke all on function public.tg_notify_follow_up() from public, anon;

drop trigger if exists trg_notify_follow_up_ins on public.follow_ups;
create trigger trg_notify_follow_up_ins
  after insert on public.follow_ups
  for each row execute function public.tg_notify_follow_up();

drop trigger if exists trg_notify_follow_up_upd on public.follow_ups;
create trigger trg_notify_follow_up_upd
  after update on public.follow_ups
  for each row execute function public.tg_notify_follow_up();

-- ===========================================================================
-- REALTIME — appointments drive the "Live updates active" feeds on the
-- Doctor and Reception dashboards. RLS still governs what each client sees.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
    ) then
      alter publication supabase_realtime add table public.appointments;
    end if;
  end if;
end $$;

commit;
