-- =============================================================================
-- MediFlow AI — pg_cron: auto no-show sweep + auto-expire slot offers
-- Migration: 20260811182459_sec_19_pgcron_auto_no_show_and_expiry  (IDEMPOTENT)
--
-- Clinic timezone is 'Asia/Muscat'; change it if the clinic moves. Jobs run
-- every 15 minutes (cron.schedule upserts by job name).
-- =============================================================================

create extension if not exists pg_cron;

create or replace function public.auto_mark_no_shows()
returns integer language plpgsql volatile security definer set search_path to '' as $$
declare v_count int;
begin
  with upd as (
    update public.appointments
       set status='no_show'
     where status in ('scheduled','confirmed')
       and (appointment_date + appointment_time) < ((now() at time zone 'Asia/Muscat') - interval '30 minutes')
    returning 1)
  select count(*) into v_count from upd;
  if v_count > 0 then
    perform private.log_audit('auto_no_show_sweep', null, null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;
revoke all on function public.auto_mark_no_shows() from public, anon, authenticated;

select cron.schedule('mediflow-auto-no-show', '*/15 * * * *', $$select public.auto_mark_no_shows();$$);
select cron.schedule('mediflow-expire-offers', '*/15 * * * *', $$select public.expire_stale_slot_offers();$$);
