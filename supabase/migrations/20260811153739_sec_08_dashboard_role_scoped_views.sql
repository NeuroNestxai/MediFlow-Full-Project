-- =============================================================================
-- MediFlow AI — Security hardening 08: role-scoped dashboard views
-- Migration: 20260811153739_sec_08_dashboard_role_scoped_views  (IDEMPOTENT)
--
-- Req 2 & 8: every dashboard reads from a clean, role-scoped view. The DOCTOR
-- views are ID-only (MF patient_id, never a name). All views are
-- security_invoker so the caller's RLS still applies; an explicit role guard
-- keeps each view's rows scoped to the intended role.
--
-- To show the doctor a stable id without any vault access, the non-PII MF code
-- is denormalized onto appointments as `patient_ref`.
-- =============================================================================

begin;

-- ---- 8a. Denormalize the non-PII MF code onto appointments ----
alter table public.appointments add column if not exists patient_ref text;

update public.appointments a
set patient_ref = p.patient_id
from public.patients p
where p.user_id = a.patient_id and a.patient_ref is null;

create or replace function public.appointments_set_patient_ref()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.patient_ref is null then
    select patient_id into new.patient_ref from public.patients where user_id = new.patient_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.appointments_set_patient_ref() from public, anon, authenticated;

drop trigger if exists trg_appointments_set_patient_ref on public.appointments;
create trigger trg_appointments_set_patient_ref
  before insert on public.appointments
  for each row execute function public.appointments_set_patient_ref();

-- ---- 8b. DOCTOR: ID-only. No name, no age/gender, no email. Ever. ----
create or replace view public.dashboard_doctor_appointments
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       a.appointment_date, a.appointment_time, a.status::text as status,
       s.name as service_name
from public.appointments a
left join public.services s on s.id = a.service_id
where private.is_doctor() and a.doctor_id = private.current_doctor_id();

create or replace view public.dashboard_doctor_patient_summary
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       a.appointment_date, a.status::text as status,
       pc.medical_history, pc.current_medications, pc.allergies, pc.presenting_symptoms,
       vs.summary as ai_visit_summary, vs.status as summary_status, vs.updated_at as summary_updated_at
from public.appointments a
left join public.patient_clinical pc on pc.user_id = a.patient_id
left join public.visit_summaries vs on vs.appointment_id = a.id
where private.is_doctor() and a.doctor_id = private.current_doctor_id();

comment on view public.dashboard_doctor_patient_summary is
  'Doctor "AI-Organized Patient Summary": MF patient_id + clinical + AI summary. Deliberately contains NO patient name.';

-- ---- 8c. PATIENT: own appointments ----
create or replace view public.dashboard_patient_appointments
with (security_invoker = true) as
select a.reference, a.patient_ref as patient_id, a.appointment_date, a.appointment_time,
       a.status::text as status, s.name as service_name, d.full_name as doctor_name, a.approved_at
from public.appointments a
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where a.patient_id = (select auth.uid()) and private.is_patient();

-- ---- 8d. RECEPTION: front desk needs names + queue ----
create or replace view public.dashboard_reception_queue
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       pt.full_name, pt.preferred_display_name,
       a.appointment_date, a.appointment_time, a.status::text as status,
       s.name as service_name, d.full_name as doctor_name
from public.appointments a
join public.patients pt on pt.user_id = a.patient_id
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where private.is_reception();

-- ---- 8e. ADMIN: full visibility + approval queue ----
create or replace view public.dashboard_admin_appointments
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       pt.full_name, pt.email,
       a.appointment_date, a.appointment_time, a.status::text as status,
       s.name as service_name, d.full_name as doctor_name,
       a.approved_by, a.approved_at, a.created_at
from public.appointments a
join public.patients pt on pt.user_id = a.patient_id
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where private.is_admin();

create or replace view public.dashboard_admin_pending_approvals
with (security_invoker = true) as
select a.id as appointment_id, a.reference, a.patient_ref as patient_id,
       pt.full_name, a.appointment_date, a.appointment_time,
       s.name as service_name, d.full_name as doctor_name, a.created_at
from public.appointments a
join public.patients pt on pt.user_id = a.patient_id
left join public.services s on s.id = a.service_id
left join public.doctors  d on d.id = a.doctor_id
where private.is_admin() and a.status = 'pending_approval';

-- ---- 8f. Grants (authenticated only; anon gets nothing) ----
revoke all on
  public.dashboard_doctor_appointments,
  public.dashboard_doctor_patient_summary,
  public.dashboard_patient_appointments,
  public.dashboard_reception_queue,
  public.dashboard_admin_appointments,
  public.dashboard_admin_pending_approvals
from anon;

grant select on
  public.dashboard_doctor_appointments,
  public.dashboard_doctor_patient_summary,
  public.dashboard_patient_appointments,
  public.dashboard_reception_queue,
  public.dashboard_admin_appointments,
  public.dashboard_admin_pending_approvals
to authenticated;

commit;
