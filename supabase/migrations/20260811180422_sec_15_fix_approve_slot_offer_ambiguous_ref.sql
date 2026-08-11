-- =============================================================================
-- MediFlow AI — Fix: approve_slot_offer 'reference' ambiguity
-- Migration: 20260811180422_sec_15_fix_approve_slot_offer_ambiguous_ref
--
-- Applied live as a hotfix after sec_14: `RETURNING reference` was ambiguous
-- between the function's OUT column and the table column. The corrected function
-- (already folded into sec_14 in this repo) reads the reference from the row it
-- already selected. Re-applying it here is an idempotent no-op on a fresh
-- install, and keeps this file in step with the live migration history.
-- =============================================================================

begin;

create or replace function public.approve_slot_offer(p_offer_id uuid)
returns table(reference text, new_date date, new_time time without time zone, status text)
language plpgsql volatile security definer set search_path to '' as $$
declare
  v_o public.slot_offers; v_appt public.appointments;
  v_old_date date; v_old_time time without time zone; v_email text; v_ref text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then raise exception 'not_authorized' using errcode='42501'; end if;

  select * into v_o from public.slot_offers where id = p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  if v_o.status <> 'accepted' then raise exception 'offer_not_accepted' using errcode='22023'; end if;

  select * into v_appt from public.appointments where id = v_o.candidate_appointment_id for update;
  if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
  if v_appt.status not in ('scheduled','confirmed') then raise exception 'appointment_not_movable' using errcode='22023'; end if;

  if exists (select 1 from public.appointments a
             where a.doctor_id=v_o.doctor_id and a.appointment_date=v_o.offer_date and a.appointment_time=v_o.offer_time
               and a.id <> v_appt.id
               and a.status in ('scheduled','confirmed','checked_in','waiting','in_consultation','completed')) then
    update public.slot_offers set status='expired', decided_by=auth.uid(), decided_at=now() where id=p_offer_id;
    raise exception 'slot_taken' using errcode='23505';
  end if;

  v_old_date := v_appt.appointment_date; v_old_time := v_appt.appointment_time;
  v_ref := v_appt.reference;

  update public.appointments
     set appointment_date=v_o.offer_date, appointment_time=v_o.offer_time
   where id=v_appt.id;

  update public.slot_offers set status='approved', decided_by=auth.uid(), decided_at=now() where id=p_offer_id;

  select p.email into v_email from public.patients p where p.user_id = v_appt.patient_id;
  if v_email is not null then
    insert into public.email_outbox (to_email, subject, body, template, related_appointment_id)
    values (v_email, 'Your MediFlow appointment was moved earlier (' || v_ref || ')',
      'Hello,' || chr(10) || chr(10) ||
      'Good news - your appointment (ref ' || v_ref || ') has been moved earlier to ' ||
      to_char(v_o.offer_date,'DD Mon YYYY') || ' at ' || to_char((v_o.offer_date+v_o.offer_time),'HH12:MI AM') || '.' || chr(10) ||
      'MediFlow / MCC Clinic', 'appointment_moved_earlier', v_appt.id);
  end if;

  perform public.open_slot_offer_for_slot(v_o.doctor_id, v_old_date, v_old_time, v_appt.patient_id, null);

  return query select v_ref, v_o.offer_date, v_o.offer_time, 'approved'::text;
end;
$$;
revoke all on function public.approve_slot_offer(uuid) from public, anon;
grant execute on function public.approve_slot_offer(uuid) to authenticated;

commit;
