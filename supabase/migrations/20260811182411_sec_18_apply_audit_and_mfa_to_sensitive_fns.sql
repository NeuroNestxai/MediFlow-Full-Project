-- =============================================================================
-- MediFlow AI — Apply audit logging + MFA (AAL2) gating to sensitive functions
-- Migration: 20260811182411_sec_18_apply_audit_and_mfa_to_sensitive_fns
--
-- MFA required for: civil-id decrypt/set, appointment approve/reject.
-- Audit logged for: all of the above + agent writes (no MFA on agent - it has
-- no interactive session). To run approvals in a demo before staff enrol MFA,
-- remove the `perform private.require_aal2();` line from the approve/reject
-- functions (keep it on the civil-id functions).
-- =============================================================================

begin;

create or replace function public.admin_set_patient_civil_id(p_user_id uuid, p_civil_id text)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  if not private.is_admin() then raise exception 'not_authorized' using errcode='42501'; end if;
  perform private.require_aal2();
  update public.patients
     set civil_id_encrypted = private.encrypt_civil_id(p_civil_id), updated_at = now()
   where user_id = p_user_id;
  if not found then raise exception 'patient_not_found' using errcode='P0002'; end if;
  perform private.log_audit('civil_id_set', 'patient', p_user_id::text, null);
end;
$$;

create or replace function public.admin_get_patient_civil_id(p_user_id uuid)
returns text language plpgsql volatile security definer set search_path to '' as $$
declare v_plain text;
begin
  if not private.is_admin() then raise exception 'not_authorized' using errcode='42501'; end if;
  perform private.require_aal2();
  select private.decrypt_civil_id(civil_id_encrypted) into v_plain
  from public.patients where user_id = p_user_id;
  perform private.log_audit('civil_id_decrypt', 'patient', p_user_id::text, null);
  return v_plain;
end;
$$;
revoke all on function public.admin_set_patient_civil_id(uuid, text) from public, anon;
revoke all on function public.admin_get_patient_civil_id(uuid)       from public, anon;
grant execute on function public.admin_set_patient_civil_id(uuid, text) to authenticated;
grant execute on function public.admin_get_patient_civil_id(uuid)       to authenticated;

create or replace function public.approve_appointment(p_appointment_id uuid)
returns table(reference text, status text, approved_at timestamptz)
language plpgsql volatile security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid(); v_row public.appointments;
  v_email text; v_doctor text; v_service text; v_date text; v_time text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform private.require_aal2();

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
  if v_row.status <> 'pending_approval' then raise exception 'not_pending_approval' using errcode='22023'; end if;

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
    values (v_email, 'Your MediFlow appointment is confirmed (' || v_row.reference || ')',
      'Hello,' || chr(10) || chr(10) ||
      'Your appointment request has been APPROVED and confirmed. Details:' || chr(10) ||
      '- Reference: ' || v_row.reference || chr(10) || '- Date: ' || v_date || chr(10) ||
      '- Time: ' || v_time || chr(10) || '- Doctor: ' || coalesce(v_doctor,'To be assigned') || chr(10) ||
      '- Service: ' || coalesce(v_service,'-') || chr(10) || chr(10) ||
      'Please arrive 10 minutes early and bring your booking reference.' || chr(10) || 'MediFlow / MCC Clinic',
      'appointment_confirmed', v_row.id);
  end if;

  perform private.log_audit('appointment_approved', 'appointment', v_row.id::text,
                            jsonb_build_object('reference', v_row.reference));
  return query select v_row.reference, v_row.status::text, v_row.approved_at;
end;
$function$;
revoke all on function public.approve_appointment(uuid) from public, anon;
grant execute on function public.approve_appointment(uuid) to authenticated;

create or replace function public.reject_appointment(p_appointment_id uuid, p_reason text default null)
returns table(reference text, status text, rejected_at timestamptz)
language plpgsql volatile security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid(); v_row public.appointments;
  v_email text; v_date text; v_time text; v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform private.require_aal2();
  if v_reason is not null and char_length(v_reason) > 1000 then raise exception 'reason_too_long' using errcode='22001'; end if;

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
  if v_row.status <> 'pending_approval' then raise exception 'not_pending_approval' using errcode='22023'; end if;

  update public.appointments
     set status='rejected', rejected_by=v_uid, rejected_at=now(), rejection_reason=v_reason,
         approved_by=null, approved_at=null
   where id = p_appointment_id returning * into v_row;

  select p.email into v_email from public.patients p where p.user_id = v_row.patient_id;
  v_date := to_char(v_row.appointment_date, 'DD Mon YYYY');
  v_time := to_char((v_row.appointment_date + v_row.appointment_time), 'HH12:MI AM');

  if v_email is not null then
    insert into public.email_outbox (to_email, subject, body, template, related_appointment_id)
    values (v_email, 'Update on your MediFlow appointment request (' || v_row.reference || ')',
      'Hello,' || chr(10) || chr(10) ||
      'We are sorry to inform you that your appointment request could not be approved.' || chr(10) ||
      '- Reference: ' || v_row.reference || chr(10) || '- Requested: ' || v_date || ' at ' || v_time || chr(10) ||
      case when v_reason is not null then '- Reason: ' || v_reason || chr(10) else '' end || chr(10) ||
      'Please book another slot or contact the clinic for assistance.' || chr(10) || 'MediFlow / MCC Clinic',
      'appointment_rejected', v_row.id);
  end if;

  perform private.log_audit('appointment_rejected', 'appointment', v_row.id::text,
                            jsonb_build_object('reference', v_row.reference, 'reason', v_reason));
  return query select v_row.reference, v_row.status::text, v_row.rejected_at;
end;
$function$;
revoke all on function public.reject_appointment(uuid, text) from public, anon;
grant execute on function public.reject_appointment(uuid, text) to authenticated;

-- Agent writes: audit only (no MFA)
create or replace function agent.record_symptoms(p_patient_id text, p_symptoms text)
returns void language plpgsql volatile security definer set search_path to '' as $$
declare v_uid uuid;
begin
  if p_symptoms is null or char_length(p_symptoms) = 0 or char_length(p_symptoms) > 4000 then
    raise exception 'invalid_symptoms' using errcode='22023';
  end if;
  select user_id into v_uid from public.patients where patient_id = p_patient_id;
  if v_uid is null then raise exception 'unknown_patient' using errcode='P0002'; end if;
  insert into public.patient_clinical (user_id, presenting_symptoms)
  values (v_uid, btrim(p_symptoms))
  on conflict (user_id) do update set presenting_symptoms=excluded.presenting_symptoms, updated_at=now();
  perform private.log_audit('agent_record_symptoms', 'patient', p_patient_id, null);
end;
$$;

create or replace function agent.write_visit_summary(p_reference text, p_summary text)
returns void language plpgsql volatile security definer set search_path to '' as $$
declare v_appt public.appointments;
begin
  if p_summary is null or char_length(btrim(p_summary)) < 1 or char_length(p_summary) > 20000 then
    raise exception 'invalid_summary' using errcode='22023';
  end if;
  select * into v_appt from public.appointments where reference = p_reference;
  if not found then raise exception 'unknown_reference' using errcode='P0002'; end if;
  insert into public.visit_summaries (appointment_id, patient_user_id, doctor_id, summary, source, status)
  values (v_appt.id, v_appt.patient_id, v_appt.doctor_id, btrim(p_summary), 'ai_agent', 'final')
  on conflict (appointment_id) do update
    set summary=excluded.summary, source='ai_agent', status=excluded.status, updated_at=now();
  perform private.log_audit('agent_write_visit_summary', 'appointment', v_appt.id::text,
                            jsonb_build_object('reference', p_reference));
end;
$$;
revoke all on function agent.record_symptoms(text, text)     from public;
revoke all on function agent.write_visit_summary(text, text) from public;
grant execute on function agent.record_symptoms(text, text)     to mediflow_agent;
grant execute on function agent.write_visit_summary(text, text) to mediflow_agent;

commit;
