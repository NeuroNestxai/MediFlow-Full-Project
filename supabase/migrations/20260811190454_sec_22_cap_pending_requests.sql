-- =============================================================================
-- MediFlow AI — Anti-abuse: cap concurrent pending requests per patient
-- Migration: 20260811190454_sec_22_cap_pending_requests  (IDEMPOTENT)
-- A patient may have at most 3 appointments awaiting approval at once.
-- =============================================================================

begin;

create or replace function public.create_patient_appointment(
  p_doctor_id uuid, p_service_id uuid, p_availability_id uuid, p_patient_notes text default null::text)
returns table(reference text, appointment_date date, appointment_time time without time zone, status text)
language plpgsql security definer set search_path to '' as $function$
declare
  v_uid uuid := auth.uid(); v_date date; v_time time; v_ref text; v_appt_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode='42501'; end if;

  if (select count(*) from public.appointments a
      where a.patient_id = v_uid and a.status = 'pending_approval') >= 3 then
    raise exception 'too_many_pending_requests' using errcode='P0001';
  end if;

  if p_patient_notes is not null and char_length(p_patient_notes) > 2000 then
    raise exception 'notes_too_long' using errcode='22001';
  end if;
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'invalid_doctor' using errcode='22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.is_active) then
    raise exception 'invalid_service' using errcode='22023';
  end if;
  if not exists (select 1 from public.doctor_services ds
                 where ds.doctor_id = p_doctor_id and ds.service_id = p_service_id) then
    raise exception 'service_not_offered' using errcode='22023';
  end if;

  select da.available_date, da.start_time into v_date, v_time
  from public.doctor_availability da
  where da.id = p_availability_id and da.doctor_id = p_doctor_id
    and da.is_active and da.available_date >= current_date;
  if not found then raise exception 'invalid_availability' using errcode='22023'; end if;

  v_ref := 'REF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.appointment_ref_seq')::text, 6, '0');

  insert into public.appointments (reference, patient_id, doctor_id, service_id,
    appointment_date, appointment_time, status, patient_notes)
  values (v_ref, v_uid, p_doctor_id, p_service_id, v_date, v_time, 'pending_approval',
          nullif(btrim(coalesce(p_patient_notes,'')), ''))
  returning id into v_appt_id;

  return query select a.reference, a.appointment_date, a.appointment_time, a.status::text
               from public.appointments a where a.id = v_appt_id;
exception
  when unique_violation then raise exception 'slot_unavailable' using errcode='23505';
end;
$function$;
revoke all on function public.create_patient_appointment(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_patient_appointment(uuid,uuid,uuid,text) to authenticated;

commit;
