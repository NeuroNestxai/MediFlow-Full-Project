-- =============================================================================
-- End-to-end test of the MediFlow three-role loop, with RLS enforced.
-- Each actor is simulated the way PostgREST does it: `set role authenticated`
-- plus a request.jwt.claim.sub matching that user's auth.users id.
--
-- Covers the demo spine:
--   patient books → reception checks in → queue → doctor consults+completes
--   → reception checks out → doctor sends follow-up → patient receives it
-- plus the permission boundaries that must hold.
-- =============================================================================
\set ON_ERROR_STOP on
\timing off

-- --- fixtures --------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'patient@mediflowom.com'),
  ('22222222-2222-2222-2222-222222222222', 'doctor@mediflowom.com'),
  ('33333333-3333-3333-3333-333333333333', 'reception@mediflowom.com'),
  ('44444444-4444-4444-4444-444444444444', 'other.doctor@mediflowom.com')
on conflict do nothing;

insert into public.profiles (id, full_name, preferred_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Maryam Rashid Al Farsi', 'Maryam', '+968 9000 0001')
on conflict do nothing;

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'patient'),
  ('22222222-2222-2222-2222-222222222222', 'doctor'),
  ('33333333-3333-3333-3333-333333333333', 'reception'),
  ('44444444-4444-4444-4444-444444444444', 'doctor')
on conflict do nothing;

-- Link the two doctor accounts to two different doctors.
update public.doctors set user_id = '22222222-2222-2222-2222-222222222222'
  where slug = (select slug from public.doctors order by slug limit 1);
update public.doctors set user_id = '44444444-4444-4444-4444-444444444444'
  where slug = (select slug from public.doctors where user_id is null order by slug limit 1);

insert into public.patient_reported_health (patient_id, allergies, current_medications)
values ('11111111-1111-1111-1111-111111111111', 'Penicillin — previous rash', 'Metformin')
on conflict (patient_id) do nothing;

create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
end;
$$;

create or replace function pg_temp.check(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  if p_ok then raise notice '  PASS  %', p_label;
  else raise exception 'FAIL: %', p_label;
  end if;
end;
$$;

-- ===========================================================================
do $$
declare
  v_patient   uuid := '11111111-1111-1111-1111-111111111111';
  v_doc_user  uuid := '22222222-2222-2222-2222-222222222222';
  v_recep     uuid := '33333333-3333-3333-3333-333333333333';
  v_other_doc uuid := '44444444-4444-4444-4444-444444444444';
  v_doctor_id uuid;
  v_service   uuid;
  v_avail     uuid;
  v_ref       text;
  v_appt      uuid;
  v_status    text;
  v_n         int;
  v_txt       text;
begin
  raise notice '--- 1. PATIENT BOOKS ---';
  perform pg_temp.act_as(v_patient);

  select d.id into v_doctor_id from public.doctors d
   where d.user_id = v_doc_user;
  select ds.service_id into v_service from public.doctor_services ds
   where ds.doctor_id = v_doctor_id limit 1;
  select s.availability_id into v_avail
    from public.get_available_slots_v2(v_doctor_id, v_service) s limit 1;
  perform pg_temp.check('patient sees an available slot', v_avail is not null);

  select r.reference into v_ref
    from public.create_patient_appointment(v_doctor_id, v_service, v_avail,
         'I need help with blood sugar follow-up.') r;
  perform pg_temp.check('booking returns a reference (' || v_ref || ')', v_ref like 'REF-%');
  select a.id into v_appt from public.appointments a where a.reference = v_ref;

  select count(*) into v_n from public.patient_notifications
   where patient_id = v_patient and type = 'appointment_booked';
  perform pg_temp.check('patient notified of booking', v_n = 1);

  raise notice '--- 2. RECEPTION LOOKS UP + CHECKS IN ---';
  perform pg_temp.act_as(v_recep);

  select l.patient_name, l.can_check_in into v_txt, v_status
    from public.staff_lookup_appointment(v_ref) l;
  perform pg_temp.check('QR/reference lookup finds the patient (' || v_txt || ')', v_txt = 'Maryam');
  perform pg_temp.check('appointment is eligible for check-in', v_status = 'true');

  select c.status into v_status from public.staff_check_in_appointment(v_appt) c;
  perform pg_temp.check('reception checks the patient in', v_status = 'checked_in');

  select count(*) into v_n from public.patient_notifications
   where patient_id = v_patient and type = 'appointment_checked_in';
  perform pg_temp.check('patient notified of check-in', v_n = 1);

  select q.status into v_status from public.staff_update_queue_status(v_appt, 'waiting') q;
  perform pg_temp.check('reception moves patient to the waiting queue', v_status = 'waiting');

  raise notice '--- 3. DOCTOR CONSULTS ---';
  perform pg_temp.act_as(v_doc_user);

  select c.status into v_status from public.doctor_start_consultation(v_appt) c;
  perform pg_temp.check('doctor starts the consultation', v_status = 'in_consultation');

  perform public.doctor_save_consultation_notes(v_appt, 'Reviewed patient-reported information. Routine follow-up discussed.');
  select cs.notes into v_txt from public.consultations cs where cs.appointment_id = v_appt;
  perform pg_temp.check('consultation notes saved', v_txt like 'Reviewed patient-reported%');

  select c.status into v_status from public.doctor_complete_consultation(v_appt) c;
  perform pg_temp.check('doctor completes the consultation', v_status = 'completed');

  select count(*) into v_n from public.consultations
   where appointment_id = v_appt and status = 'completed' and completed_at is not null;
  perform pg_temp.check('consultation row marked completed', v_n = 1);

  raise notice '--- 4. RECEPTION CHECKS OUT ---';
  perform pg_temp.act_as(v_recep);
  select c.status into v_status from public.staff_check_out_appointment(v_appt) c;
  perform pg_temp.check('reception checks the patient out', v_status = 'checked_out');

  raise notice '--- 5. DOCTOR SENDS A FOLLOW-UP ---';
  perform pg_temp.act_as(v_doc_user);

  select f.status into v_status from public.doctor_create_follow_up(
    v_appt, 'recheck', current_date + 28,
    'Continue current routine and recheck in 4 weeks.', true, false, 'Internal note', false) f;
  perform pg_temp.check('unapproved follow-up saves as a draft', v_status = 'draft');

  select count(*) into v_n from public.patient_notifications
   where patient_id = v_patient and type = 'follow_up';
  perform pg_temp.check('draft follow-up does NOT notify the patient', v_n = 0);

  select f.status into v_status from public.doctor_create_follow_up(
    v_appt, 'recheck', current_date + 28,
    'Continue current routine and recheck in 4 weeks.', true, false, null, true) f;
  perform pg_temp.check('approved follow-up is published', v_status = 'approved');

  select count(*) into v_n from public.patient_notifications
   where patient_id = v_patient and type = 'follow_up';
  perform pg_temp.check('approved follow-up notifies the patient', v_n = 1);

  raise notice '--- 6. FULL LIFECYCLE RECORDED ---';
  select count(*) into v_n from public.appointment_status_history where appointment_id = v_appt;
  perform pg_temp.check('status history captured every transition (' || v_n || ' rows)', v_n >= 6);
end $$;

-- ===========================================================================
-- RLS / permission-boundary checks, run as the real `authenticated` role.
-- ===========================================================================
do $$
declare
  v_patient   uuid := '11111111-1111-1111-1111-111111111111';
  v_doc_user  uuid := '22222222-2222-2222-2222-222222222222';
  v_recep     uuid := '33333333-3333-3333-3333-333333333333';
  v_other_doc uuid := '44444444-4444-4444-4444-444444444444';
  v_n int;
begin
  raise notice '--- 7. PERMISSION BOUNDARIES ---';

  set local role authenticated;

  perform pg_temp.act_as(v_recep);
  select count(*) into v_n from public.consultations;
  perform pg_temp.check('reception CANNOT read clinical consultation notes', v_n = 0);
  select count(*) into v_n from public.follow_ups;
  perform pg_temp.check('reception CANNOT read follow-up instructions', v_n = 0);
  select count(*) into v_n from public.appointments;
  perform pg_temp.check('reception CAN read operational appointments', v_n >= 1);

  perform pg_temp.act_as(v_doc_user);
  select count(*) into v_n from public.consultations;
  perform pg_temp.check('treating doctor CAN read their consultation', v_n = 1);
  select count(*) into v_n from public.patient_reported_health;
  perform pg_temp.check('treating doctor CAN read patient-reported health', v_n = 1);
  select count(*) into v_n from public.appointments;
  perform pg_temp.check('doctor sees only their own appointments', v_n = 1);

  perform pg_temp.act_as(v_other_doc);
  select count(*) into v_n from public.appointments;
  perform pg_temp.check('unrelated doctor sees NO appointments', v_n = 0);
  select count(*) into v_n from public.consultations;
  perform pg_temp.check('unrelated doctor sees NO consultations', v_n = 0);
  select count(*) into v_n from public.patient_reported_health;
  perform pg_temp.check('unrelated doctor sees NO patient health records', v_n = 0);

  perform pg_temp.act_as(v_patient);
  select count(*) into v_n from public.follow_ups;
  perform pg_temp.check('patient sees ONLY the approved follow-up', v_n = 1);
  select count(*) into v_n from public.consultations;
  perform pg_temp.check('patient CANNOT read consultation notes', v_n = 0);

  reset role;
end $$;

-- Privilege escalation attempts must all be rejected.
do $$
declare v_appt uuid; v_ok boolean;
begin
  raise notice '--- 8. PRIVILEGE ESCALATION ---';
  select id into v_appt from public.appointments order by created_at desc limit 1;

  perform pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- patient
  begin
    perform public.staff_check_in_appointment(v_appt);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.check('patient CANNOT call the reception check-in RPC', v_ok);

  begin
    perform public.doctor_complete_consultation(v_appt);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.check('patient CANNOT complete a consultation', v_ok);

  perform pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- reception
  begin
    perform public.doctor_complete_consultation(v_appt);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.check('reception CANNOT complete a consultation', v_ok);

  perform pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- other doctor
  begin
    perform public.doctor_complete_consultation(v_appt);
    v_ok := false;
  exception when no_data_found then v_ok := true;
  end;
  perform pg_temp.check('another doctor CANNOT touch this appointment', v_ok);

  perform pg_temp.act_as('33333333-3333-3333-3333-333333333333');
  begin
    perform public.staff_check_out_appointment(v_appt);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.check('double check-out is rejected', v_ok);

  raise notice '';
  raise notice 'ALL CHECKS PASSED';
end $$;
