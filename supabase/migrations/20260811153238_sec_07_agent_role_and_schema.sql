-- =============================================================================
-- MediFlow AI — Security hardening 07: locked-down AI agent surface
-- Migration: 20260811153238_sec_07_agent_role_and_schema  (IDEMPOTENT)
--
-- Req 1 & 7: the n8n/Gemini agent connects as role `mediflow_agent`. Its ONLY
-- reachable objects are the agent.* views/functions below — all keyed by MF
-- patient_id or the booking reference, never by name/email/civil_id.
--
-- IMPORTANT (integration): point the agent's DB connection at `mediflow_agent`,
-- NOT service_role. service_role bypasses all RLS/grants and would void this.
-- The role is created NOLOGIN; enable it with a password before use:
--   alter role mediflow_agent with login password '<strong-secret>';
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mediflow_agent') then
    create role mediflow_agent nologin;
  end if;
end $$;

create schema if not exists agent;
comment on schema agent is 'Sole surface for the n8n/Gemini agent (role mediflow_agent). No PII.';

create or replace view agent.patient_clinical
with (security_invoker = false) as
  select pt.patient_id,
         pc.medical_history,
         pc.current_medications,
         pc.allergies,
         pc.presenting_symptoms,
         pc.updated_at
  from public.patients pt
  left join public.patient_clinical pc on pc.user_id = pt.user_id;
comment on view agent.patient_clinical is 'Agent-safe clinical lookup keyed by MF patient_id. Replaces the Excel hand-off.';

create or replace view agent.appointment_context
with (security_invoker = false) as
  select a.reference,
         pt.patient_id,
         a.appointment_date,
         a.appointment_time,
         a.status::text as status,
         s.name  as service_name,
         sp.name as specialty_name,
         d.full_name as doctor_name
  from public.appointments a
  join public.patients pt on pt.user_id = a.patient_id
  left join public.services s   on s.id = a.service_id
  left join public.doctors  d   on d.id = a.doctor_id
  left join public.specialties sp on sp.id = d.specialty_id;
comment on view agent.appointment_context is 'Agent-safe appointment context keyed by booking reference. No patient name/email.';

create or replace function agent.record_symptoms(p_patient_id text, p_symptoms text)
returns void language plpgsql volatile security definer set search_path to '' as $$
declare v_uid uuid;
begin
  if p_symptoms is null or char_length(p_symptoms) = 0 or char_length(p_symptoms) > 4000 then
    raise exception 'invalid_symptoms' using errcode = '22023';
  end if;
  select user_id into v_uid from public.patients where patient_id = p_patient_id;
  if v_uid is null then raise exception 'unknown_patient' using errcode = 'P0002'; end if;

  insert into public.patient_clinical (user_id, presenting_symptoms)
  values (v_uid, btrim(p_symptoms))
  on conflict (user_id) do update
    set presenting_symptoms = excluded.presenting_symptoms, updated_at = now();
end;
$$;

create or replace function agent.write_visit_summary(p_reference text, p_summary text)
returns void language plpgsql volatile security definer set search_path to '' as $$
declare v_appt public.appointments;
begin
  if p_summary is null or char_length(btrim(p_summary)) < 1 or char_length(p_summary) > 20000 then
    raise exception 'invalid_summary' using errcode = '22023';
  end if;
  select * into v_appt from public.appointments where reference = p_reference;
  if not found then raise exception 'unknown_reference' using errcode = 'P0002'; end if;

  insert into public.visit_summaries (appointment_id, patient_user_id, doctor_id, summary, source, status)
  values (v_appt.id, v_appt.patient_id, v_appt.doctor_id, btrim(p_summary), 'ai_agent', 'final')
  on conflict (appointment_id) do update
    set summary = excluded.summary, source = 'ai_agent', status = excluded.status, updated_at = now();
end;
$$;

revoke all on function agent.record_symptoms(text, text)     from public;
revoke all on function agent.write_visit_summary(text, text) from public;

grant usage on schema agent to mediflow_agent;
grant select on agent.patient_clinical    to mediflow_agent;
grant select on agent.appointment_context to mediflow_agent;
grant execute on function agent.record_symptoms(text, text)     to mediflow_agent;
grant execute on function agent.write_visit_summary(text, text) to mediflow_agent;

-- Belt-and-suspenders: agent role holds no privileges on the PII tables.
revoke all on public.patients        from mediflow_agent;
revoke all on public.patient_clinical from mediflow_agent;
revoke all on public.profiles        from mediflow_agent;
revoke all on public.email_outbox    from mediflow_agent;

commit;
