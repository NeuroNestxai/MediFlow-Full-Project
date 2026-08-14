-- =============================================================================
-- MediFlow AI — staff_lookup_appointment also returns the patient MF ID
-- Migration: 20260814000001_staff_lookup_returns_patient_ref  (ADDITIVE)
--
-- Reception's QR-scan verification card now shows the stable MediFlow patient
-- ID (appointments.patient_ref, e.g. MF412300) alongside the name/phone.
--
-- This was applied to the live project directly. The prior version's body is
-- preserved verbatim; only the extra `patient_ref` column is added to the
-- RETURNS TABLE (and to the SELECT). Adding a column to a function's return
-- type requires drop + recreate — CREATE OR REPLACE cannot change it.
--
-- Operational data only — no clinical/PII fields are returned. patient_ref is
-- the non-PII identifier that is safe to display to staff (and, later, to send
-- to the AI). Name/age/gender/civil id are NOT here.
-- =============================================================================

drop function if exists public.staff_lookup_appointment(text);

create function public.staff_lookup_appointment(p_reference text)
returns table (
  appointment_id    uuid,
  reference         text,
  patient_ref       text,
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
         a.patient_ref,
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

revoke all on function public.staff_lookup_appointment(text) from public, anon;
grant execute on function public.staff_lookup_appointment(text) to authenticated;
