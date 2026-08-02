-- =============================================================================
-- MediFlow AI — In-app Patient Notifications
-- Migration: 20260802000007_add_patient_notifications  (ADDITIVE, IDEMPOTENT)
--
-- A per-patient notifications feed populated by SECURITY DEFINER triggers on
-- appointments (booked / cancelled / rescheduled / checked_in) and on
-- clinic-provided documents. Patients can only READ their own rows and mark
-- them read via RPCs; they can never insert arbitrary notifications.
--
-- No email/SMS. No follow-up notifications. Text contains only operational
-- details (reference/date/time) — never medical information. Existing
-- appointment triggers (updated_at, status-history) are left intact; these are
-- NEW, separate triggers.
--
-- SAFETY: additive; single transaction; RLS; own-row only; no anon; no
-- service-role. Realtime publication is added idempotently.
-- =============================================================================

begin;

create table if not exists public.patient_notifications (
  id                      uuid primary key default gen_random_uuid(),
  patient_id              uuid not null references public.profiles(id) on delete cascade,
  type                    text not null,
  title                   text not null,
  message                 text not null,
  related_appointment_id  uuid references public.appointments(id) on delete set null,
  related_document_id     uuid references public.patient_documents(id) on delete set null,
  is_read                 boolean not null default false,
  created_at              timestamptz not null default now(),
  read_at                 timestamptz
);

create index if not exists patient_notifications_patient_idx
  on public.patient_notifications (patient_id, is_read, created_at desc);

alter table public.patient_notifications enable row level security;

revoke all on public.patient_notifications from anon, authenticated;
grant select on public.patient_notifications to authenticated;

drop policy if exists pn_select_own on public.patient_notifications;
create policy pn_select_own on public.patient_notifications
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

-- ---------------------------------------------------------------------------
-- Creation triggers (SECURITY DEFINER — the only way rows are inserted).
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date text := to_char(new.appointment_date, 'DD Mon YYYY');
  v_time text := to_char((new.appointment_date + new.appointment_time), 'HH12:MI AM');
begin
  if tg_op = 'INSERT' then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_booked', 'Appointment booked',
            'Your appointment (ref ' || new.reference || ') is booked for ' || v_date || ' at ' || v_time || '.',
            new.id);
    return new;
  end if;

  -- UPDATE: exactly one notification per relevant change (no duplicates).
  if new.status = 'cancelled' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_cancelled', 'Appointment cancelled',
            'Your appointment (ref ' || new.reference || ') has been cancelled.', new.id);
  elsif new.status = 'checked_in' and old.status is distinct from new.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_checked_in', 'Checked in',
            'You are checked in for your appointment (ref ' || new.reference || ').', new.id);
  elsif (new.appointment_date is distinct from old.appointment_date
         or new.appointment_time is distinct from old.appointment_time)
        and new.status is not distinct from old.status then
    insert into public.patient_notifications (patient_id, type, title, message, related_appointment_id)
    values (new.patient_id, 'appointment_rescheduled', 'Appointment rescheduled',
            'Your appointment (ref ' || new.reference || ') is now ' || v_date || ' at ' || v_time || '.',
            new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.tg_notify_appointment() from public, anon;

drop trigger if exists trg_notify_appointment_ins on public.appointments;
create trigger trg_notify_appointment_ins
  after insert on public.appointments
  for each row execute function public.tg_notify_appointment();

drop trigger if exists trg_notify_appointment_upd on public.appointments;
create trigger trg_notify_appointment_upd
  after update on public.appointments
  for each row execute function public.tg_notify_appointment();

-- Clinic-provided documents only (patient-uploaded files never self-notify).
create or replace function public.tg_notify_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'clinic_provided' then
    insert into public.patient_notifications (patient_id, type, title, message, related_document_id)
    values (new.patient_id, 'document_added', 'New document available',
            'A new document from the clinic is available in your Documents.', new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.tg_notify_document() from public, anon;

drop trigger if exists trg_notify_document on public.patient_documents;
create trigger trg_notify_document
  after insert on public.patient_documents
  for each row execute function public.tg_notify_document();

-- ---------------------------------------------------------------------------
-- Mark-read RPCs (own rows only; the only way patients modify notifications).
-- ---------------------------------------------------------------------------
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.patient_notifications
     set is_read = true, read_at = now()
   where id = p_id and patient_id = auth.uid() and not is_read;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_patient() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.patient_notifications
     set is_read = true, read_at = now()
   where patient_id = auth.uid() and not is_read;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: add to the supabase_realtime publication (idempotent). RLS still
-- governs which rows each client receives. The UI also refetches, so Realtime
-- is a progressive enhancement.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'patient_notifications'
    ) then
      alter publication supabase_realtime add table public.patient_notifications;
    end if;
  end if;
end $$;

commit;
