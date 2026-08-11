-- =============================================================================
-- MediFlow AI — Cancellation waitlist. Logic layer.
-- Migration: 20260811180227_sec_14_slot_offer_waitlist_logic  (IDEMPOTENT)
--
-- NOTE: approve_slot_offer here already includes the fix that was applied live
-- as sec_15 (the 'reference' OUT-column ambiguity). sec_15 re-applies the same
-- corrected function and is a harmless no-op on a fresh install.
-- =============================================================================

begin;

-- Core: offer a freed slot to the top-priority opted-in candidate.
create or replace function public.open_slot_offer_for_slot(
  p_doctor_id uuid, p_date date, p_time time without time zone,
  p_exclude_user uuid default null, p_freed_appointment_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path to '' as $$
declare v_cand public.appointments; v_offer uuid;
begin
  if p_date < current_date then return null; end if;

  if exists (select 1 from public.appointments a
             where a.doctor_id=p_doctor_id and a.appointment_date=p_date and a.appointment_time=p_time
               and a.status in ('scheduled','confirmed','checked_in','waiting','in_consultation','completed')) then
    return null;
  end if;

  select a.* into v_cand
  from public.appointments a
  where a.doctor_id = p_doctor_id
    and a.wants_earlier = true
    and a.status in ('scheduled','confirmed')
    and (p_exclude_user is null or a.patient_id <> p_exclude_user)
    and (a.appointment_date + a.appointment_time) > (p_date + p_time)
    and not exists (
      select 1 from public.slot_offers so
      where so.candidate_appointment_id = a.id
        and ( so.status in ('offered','accepted')
              or (so.doctor_id=p_doctor_id and so.offer_date=p_date and so.offer_time=p_time) )
    )
  order by a.appointment_date asc, a.appointment_time asc
  limit 1;

  if not found then return null; end if;

  insert into public.slot_offers (freed_appointment_id, doctor_id, offer_date, offer_time,
                                  candidate_appointment_id, candidate_user_id, status, expires_at)
  values (p_freed_appointment_id, p_doctor_id, p_date, p_time,
          v_cand.id, v_cand.patient_id, 'offered', now() + interval '24 hours')
  returning id into v_offer;

  insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
  values (v_cand.patient_id, 'slot_offer', 'Earlier slot available',
    'An earlier slot opened on ' || to_char(p_date,'DD Mon YYYY') || ' at ' ||
    to_char((p_date + p_time),'HH12:MI AM') ||
    ' with your doctor. Open your appointment to move up or keep your current time (offer expires in 24h).', v_cand.id);

  return v_offer;
end;
$$;
revoke all on function public.open_slot_offer_for_slot(uuid, date, time, uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_appointments_offer_on_cancel()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'cancelled' and old.status in ('scheduled','confirmed') then
    perform public.open_slot_offer_for_slot(new.doctor_id, new.appointment_date, new.appointment_time,
                                            new.patient_id, new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_appointments_offer_on_cancel() from public, anon, authenticated;

drop trigger if exists trg_appointments_offer_on_cancel on public.appointments;
create trigger trg_appointments_offer_on_cancel
  after update on public.appointments
  for each row execute function public.tg_appointments_offer_on_cancel();

create or replace function public.respond_slot_offer(p_offer_id uuid, p_accept boolean)
returns table(status text) language plpgsql volatile security definer set search_path to '' as $$
declare v_o public.slot_offers;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.is_patient() then raise exception 'not_authorized' using errcode='42501'; end if;

  select * into v_o from public.slot_offers where id = p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  if v_o.candidate_user_id <> auth.uid() then raise exception 'not_authorized' using errcode='42501'; end if;
  if v_o.status <> 'offered' then raise exception 'offer_not_open' using errcode='22023'; end if;

  if v_o.expires_at < now() then
    update public.slot_offers set status='expired', responded_at=now() where id=p_offer_id;
    perform public.open_slot_offer_for_slot(v_o.doctor_id, v_o.offer_date, v_o.offer_time, null, v_o.freed_appointment_id);
    raise exception 'offer_expired' using errcode='22023';
  end if;

  if p_accept then
    update public.slot_offers set status='accepted', responded_at=now() where id=p_offer_id;
    return query select 'accepted'::text;
  else
    update public.slot_offers set status='declined', responded_at=now() where id=p_offer_id;
    perform public.open_slot_offer_for_slot(v_o.doctor_id, v_o.offer_date, v_o.offer_time, null, v_o.freed_appointment_id);
    return query select 'declined'::text;
  end if;
end;
$$;
revoke all on function public.respond_slot_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_slot_offer(uuid, boolean) to authenticated;

-- Admin/reception approves the move (includes the sec_15 fix: use v_appt.reference, no ambiguous RETURNING)
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

create or replace function public.reject_slot_offer(p_offer_id uuid, p_reason text default null)
returns table(status text) language plpgsql volatile security definer set search_path to '' as $$
declare v_o public.slot_offers; v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not (private.is_admin() or private.is_reception()) then raise exception 'not_authorized' using errcode='42501'; end if;

  select * into v_o from public.slot_offers where id=p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  if v_o.status <> 'accepted' then raise exception 'offer_not_accepted' using errcode='22023'; end if;

  update public.slot_offers set status='rejected', reason=v_reason, decided_by=auth.uid(), decided_at=now()
   where id=p_offer_id;

  insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
  values (v_o.candidate_user_id, 'slot_offer_rejected', 'Move not approved',
    'Your request to move to an earlier slot could not be approved. Your original appointment stays unchanged.'
    || coalesce(' Reason: ' || v_reason, ''), v_o.candidate_appointment_id);

  perform public.open_slot_offer_for_slot(v_o.doctor_id, v_o.offer_date, v_o.offer_time, null, v_o.freed_appointment_id);

  return query select 'rejected'::text;
end;
$$;
revoke all on function public.reject_slot_offer(uuid, text) from public, anon;
grant execute on function public.reject_slot_offer(uuid, text) to authenticated;

create or replace function public.expire_stale_slot_offers()
returns integer language plpgsql volatile security definer set search_path to '' as $$
declare r record; v_count int := 0;
begin
  if auth.uid() is not null and not (private.is_admin() or private.is_reception()) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  for r in select * from public.slot_offers where status='offered' and expires_at < now() loop
    update public.slot_offers set status='expired' where id=r.id;
    perform public.open_slot_offer_for_slot(r.doctor_id, r.offer_date, r.offer_time, null, r.freed_appointment_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.expire_stale_slot_offers() from public, anon;
grant execute on function public.expire_stale_slot_offers() to authenticated;

commit;
