-- =============================================================================
-- Verify the Doctor + Reception layer is fully applied.
-- Every row must read OK. Read-only — changes nothing.
-- =============================================================================

with checks(step, item, ok) as (
  values
    ('1', 'status "waiting" exists', exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'appointment_status' and e.enumlabel = 'waiting')),
    ('1', 'status "in_consultation" exists', exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'appointment_status' and e.enumlabel = 'in_consultation')),
    ('1', 'status "checked_out" exists', exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'appointment_status' and e.enumlabel = 'checked_out')),
    ('1', 'status "no_show" exists', exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'appointment_status' and e.enumlabel = 'no_show')),

    ('2', 'doctors.user_id column', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'doctors' and column_name = 'user_id')),
    ('2', 'private.is_doctor()', to_regprocedure('private.is_doctor()') is not null),
    ('2', 'private.is_reception()', to_regprocedure('private.is_reception()') is not null),
    ('2', 'private.current_doctor_id()', to_regprocedure('private.current_doctor_id()') is not null),
    ('2', 'consultations table', to_regclass('public.consultations') is not null),
    ('2', 'follow_ups table', to_regclass('public.follow_ups') is not null),
    ('2', 'doctor can read own appointments', exists (
        select 1 from pg_policies where tablename = 'appointments'
        and policyname = 'appointments_select_doctor')),
    ('2', 'reception can read appointments', exists (
        select 1 from pg_policies where tablename = 'appointments'
        and policyname = 'appointments_select_reception')),
    ('2', 'reception BLOCKED from consultations', not exists (
        select 1 from pg_policies where tablename = 'consultations'
        and qual like '%is_reception%')),

    ('3', 'staff_lookup_appointment', to_regprocedure('public.staff_lookup_appointment(text)') is not null),
    ('3', 'staff_check_in_appointment', to_regprocedure('public.staff_check_in_appointment(uuid)') is not null),
    ('3', 'staff_update_queue_status', to_regprocedure('public.staff_update_queue_status(uuid,text)') is not null),
    ('3', 'staff_check_out_appointment', to_regprocedure('public.staff_check_out_appointment(uuid)') is not null),
    ('3', 'doctor_start_consultation', to_regprocedure('public.doctor_start_consultation(uuid)') is not null),
    ('3', 'doctor_save_consultation_notes', to_regprocedure('public.doctor_save_consultation_notes(uuid,text)') is not null),
    ('3', 'doctor_complete_consultation', to_regprocedure('public.doctor_complete_consultation(uuid)') is not null),
    ('3', 'doctor_mark_no_show', to_regprocedure('public.doctor_mark_no_show(uuid)') is not null),
    ('3', 'doctor_create_follow_up', to_regprocedure(
        'public.doctor_create_follow_up(uuid,text,date,text,boolean,boolean,text,boolean)') is not null),
    ('3', 'appointments realtime enabled', exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments')),

    -- The demo needs one working account of each role. user_roles is keyed by
    -- user_id, so each person holds exactly one.
    ('5', 'a doctor account exists, linked to a directory record', exists (
        select 1 from auth.users u
        join public.user_roles r on r.user_id = u.id
        join public.doctors    d on d.user_id = u.id
        where r.role::text = 'doctor' and lower(u.email) like '%@mccoman.com')),
    ('5', 'a reception account exists', exists (
        select 1 from auth.users u join public.user_roles r on r.user_id = u.id
        where r.role::text = 'reception' and lower(u.email) like '%@mccoman.com')),
    ('5', 'a patient account exists', exists (
        select 1 from auth.users u join public.user_roles r on r.user_id = u.id
        where r.role::text = 'patient')),
    ('5', 'every clinic account can sign in', not exists (
        select 1 from auth.users u
        where lower(u.email) like '%@mccoman.com' and u.email_confirmed_at is null)),
    -- Staff must NOT also count as patients: private.is_patient() guards the
    -- patient data and the booking procedures.
    ('5', 'no staff account is also a patient', not exists (
        select 1 from auth.users u join public.user_roles r on r.user_id = u.id
        where r.role::text = 'patient'
          and lower(u.email) like '%@mccoman.com'
          and lower(u.email) <> 'demo.patient@mccoman.com'))
)
select case when ok then 'OK' else 'MISSING' end as result,
       'step ' || step as step,
       item
from checks
order by ok, step, item;
