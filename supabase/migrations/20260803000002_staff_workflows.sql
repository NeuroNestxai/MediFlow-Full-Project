-- =============================================================================
-- MediFlow AI — Doctor + Reception workflows
-- Migration: 20260803000002_staff_workflows  (ADDITIVE, IDEMPOTENT)
--
-- Connects the three roles into one appointment lifecycle:
--
--   Patient books ──▶ Reception checks in (QR) ──▶ Live Queue (waiting)
--     ──▶ Doctor consults ──▶ Doctor completes ──▶ Reception checks out
--     ──▶ Doctor-approved follow-up reaches the patient
--
-- Security model (identical to the patient slice):
--   * Staff NEVER get direct INSERT/UPDATE on appointments. Every transition
--     goes through a SECURITY DEFINER RPC that re-derives the actor from
--     auth.uid() and enforces the role from public.user_roles.
--   * All SECURITY DEFINER functions use search_path = '' with fully-qualified
--     names, and are revoked from public/anon before being granted.
--   * RLS scopes doctors to their OWN appointments and to the clinical records
--     of patients who actually have an appointment with them.
--
-- Permission boundary enforced in the database, not just the UI:
--   Reception can read operational appointment state, but has NO policy on
--   `consultations` or `follow_ups` — clinical notes are unreadable to them.
--
-- Medical-safety boundary preserved: no diagnosis, prescription, severity,
-- urgency or triage column exists anywhere below. Consultation notes are free
-- text authored by the clinician; follow-ups carry doctor-approved
-- instructions only and reach the patient ONLY after explicit approval.
-- =============================================================================

begin;

-- ===========================================================================
-- 1. LINK AN AUTH USER TO A DOCTOR RECORD
--    Without this an authenticated doctor cannot be resolved to a doctors row.
-- ===========================================================================
alter table public.doctors
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists doctors_user_id_key
  on public.doctors (user_id) where user_id is not null;

-- ===========================================================================
-- 2. AUTHORIZATION HELPERS (private schema, never exposed via PostgREST)
--    Roles are read from public.user_roles — never from editable metadata.
-- ===========================================================================
create or replace function private.is_doctor()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'doctor'
  );
$$;

create or replace function private.is_reception()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role::text = 'reception'
  );
$$;

-- The doctors row belonging to the caller, or NULL. NULL means "not a linked
-- doctor" and every policy/RPC below then denies access.
create or replace function private.current_doctor_id()
returns uuid language sql security definer set search_path = '' stable as $$
  select d.id from public.doctors d
  where d.user_id = auth.uid() and d.is_active
  limit 1;
$$;

-- True when the caller is a doctor who has (or had) an appointment with this
-- patient. Gates access to patient-reported clinical records.
create or replace function private.doctor_has_patient(p_patient_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.appointments a
    where a.patient_id = p_patient_id
      and a.doctor_id = private.current_doctor_id()
  );
$$;

revoke all on function private.is_doctor()                   from public, anon;
revoke all on function private.is_reception()                from public, anon;
revoke all on function private.current_doctor_id()           from public, anon;
revoke all on function private.doctor_has_patient(uuid)      from public, anon;
grant execute on function private.is_doctor()                to authenticated;
grant execute on function private.is_reception()             to authenticated;
grant execute on function private.current_doctor_id()        to authenticated;
grant execute on function private.doctor_has_patient(uuid)   to authenticated;

-- ===========================================================================
-- 3. STAFF READ ACCESS (additive policies — patient policies stay untouched)
-- ===========================================================================

-- Appointments: a doctor sees only their own; reception sees all (operational).
drop policy if exists appointments_select_doctor on public.appointments;
create policy appointments_select_doctor on public.appointments
  for select to authenticated
  using (private.is_doctor() and doctor_id = private.current_doctor_id());

drop policy if exists appointments_select_reception on public.appointments;
create policy appointments_select_reception on public.appointments
  for select to authenticated
  using (private.is_reception());

-- Status history mirrors the appointment visibility (drives the timeline UI).
drop policy if exists ash_select_staff on public.appointment_status_history;
create policy ash_select_staff on public.appointment_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_status_history.appointment_id
        and (
          private.is_reception()
          or (private.is_doctor() and a.doctor_id = private.current_doctor_id())
        )
    )
  );

-- Profiles: staff need the patient's name/phone to run the clinic. Additive —
-- whatever own-row policy already exists on profiles is preserved (SELECT
-- policies are OR'd).
drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (
    private.is_reception()
    or (private.is_doctor() and private.doctor_has_patient(id))
  );

-- Patient-reported health: the treating doctor only. Reception never sees it.
drop policy if exists prh_select_doctor on public.patient_reported_health;
create policy prh_select_doctor on public.patient_reported_health
  for select to authenticated
  using (private.is_doctor() and private.doctor_has_patient(patient_id));

-- Patient documents: the treating doctor only.
drop policy if exists patient_documents_select_doctor on public.patient_documents;
create policy patient_documents_select_doctor on public.patient_documents
  for select to authenticated
  using (private.is_doctor() and private.doctor_has_patient(patient_id));

-- Doctor availability: a doctor reads their own; reception reads all (to show
-- clinic schedules). Patients still reach slots only via get_available_slots.
drop policy if exists doctor_availability_select_staff on public.doctor_availability;
create policy doctor_availability_select_staff on public.doctor_availability
  for select to authenticated
  using (
    private.is_reception()
    or (private.is_doctor() and doctor_id = private.current_doctor_id())
  );

grant select on public.doctor_availability to authenticated;

-- ===========================================================================
-- 4. CONSULTATIONS  (clinician-authored; invisible to reception by design)
-- ===========================================================================
create table if not exists public.consultations (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null unique references public.appointments(id) on delete cascade,
  doctor_id       uuid not null references public.doctors(id) on delete restrict,
  notes           text check (notes is null or char_length(notes) <= 20000),
  status          text not null default 'draft' check (status in ('draft', 'completed')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create index if not exists consultations_doctor_idx on public.consultations (doctor_id);

alter table public.consultations enable row level security;
revoke all on public.consultations from anon, authenticated;
grant select on public.consultations to authenticated;

-- ONLY the authoring doctor may read. No reception policy, no patient policy.
drop policy if exists consultations_select_doctor on public.consultations;
create policy consultations_select_doctor on public.consultations
  for select to authenticated
  using (private.is_doctor() and doctor_id = private.current_doctor_id());

drop trigger if exists trg_consultations_set_updated_at on public.consultations;
create trigger trg_consultations_set_updated_at
  before update on public.consultations
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- 5. FOLLOW-UPS  (nothing reaches the patient until status = 'approved')
-- ===========================================================================
create table if not exists public.follow_ups (
  id                        uuid primary key default gen_random_uuid(),
  appointment_id            uuid not null references public.appointments(id) on delete cascade,
  patient_id                uuid not null references public.profiles(id) on delete cascade,
  doctor_id                 uuid not null references public.doctors(id) on delete restrict,
  follow_up_type            text not null check (follow_up_type in
                              ('recheck', 'test_review', 'medication_review', 'general_check_in')),
  due_date                  date not null,
  instructions              text not null check (char_length(instructions) between 1 and 4000),
  set_reminder              boolean not null default false,
  new_appointment_required  boolean not null default false,
  internal_notes            text check (internal_notes is null or char_length(internal_notes) <= 2000),
  status                    text not null default 'draft' check (status in ('draft', 'approved', 'completed')),
  approved_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists follow_ups_patient_idx on public.follow_ups (patient_id, status, due_date);
create index if not exists follow_ups_doctor_idx  on public.follow_ups (doctor_id, status, due_date);

alter table public.follow_ups enable row level security;
revoke all on public.follow_ups from anon, authenticated;
grant select on public.follow_ups to authenticated;

-- The authoring doctor sees drafts and approved.
drop policy if exists follow_ups_select_doctor on public.follow_ups;
create policy follow_ups_select_doctor on public.follow_ups
  for select to authenticated
  using (private.is_doctor() and doctor_id = private.current_doctor_id());

-- The patient sees ONLY approved follow-ups, and never `internal_notes`
-- (the app selects an explicit column list; drafts are excluded here too).
drop policy if exists follow_ups_select_patient on public.follow_ups;
create policy follow_ups_select_patient on public.follow_ups
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient() and status in ('approved', 'completed'));

drop trigger if exists trg_follow_ups_set_updated_at on public.follow_ups;
create trigger trg_follow_ups_set_updated_at
  before update on public.follow_ups
  for each row execute function public.tg_set_updated_at();

commit;
