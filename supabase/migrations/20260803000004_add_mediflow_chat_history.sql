-- =============================================================================
-- MediFlow AI — Persistent Ask MediFlow conversation history
-- Migration: 20260803000004_add_mediflow_chat_history  (ADDITIVE, IDEMPOTENT)
--
-- Private, patient-owned chat history for the Ask MediFlow assistant: threads
-- (conversations) and their messages. This is NOT a clinical record. Doctors
-- and Reception have NO access. Nothing here stores a Supabase access token,
-- email, the n8n webhook URL, appointment records, or any medical history —
-- only the plain-text messages the patient and MediFlow exchanged, plus a
-- RANDOM per-thread n8n session id.
--
-- Conventions match the existing patient migrations: single transaction, RLS
-- on, no anon, own-row only via private.is_patient(), the shared
-- public.tg_set_updated_at() trigger, and public.profiles(id) as the patient
-- identity with ON DELETE CASCADE.
--
-- SAFETY: additive; single transaction; RLS; own-row only; no service-role;
-- no raw n8n errors stored.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Threads (one row per saved conversation).
-- ---------------------------------------------------------------------------
create table if not exists public.mediflow_chat_threads (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.profiles(id) on delete cascade,
  title            text not null default 'New conversation',
  -- Random, opaque session id (client-generated). NEVER derived from patient
  -- name / email / user id / appointment reference / health data.
  n8n_session_id   text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  archived_at      timestamptz,
  constraint mediflow_chat_threads_title_len
    check (char_length(title) between 1 and 120),
  constraint mediflow_chat_threads_session_fmt
    check (n8n_session_id ~ '^[A-Za-z0-9._-]{1,128}$')
);

-- Sidebar ordering: a patient's threads, most-recently-active first.
create index if not exists mediflow_chat_threads_patient_idx
  on public.mediflow_chat_threads (patient_id, last_message_at desc);

-- ---------------------------------------------------------------------------
-- Messages (plain text only; sender is patient or mediflow).
-- ---------------------------------------------------------------------------
create table if not exists public.mediflow_chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references public.mediflow_chat_threads(id) on delete cascade,
  -- Idempotency key supplied by the client so a retry / double-click / double
  -- POST never stores the same message twice.
  client_message_id  uuid not null,
  sender             text not null check (sender in ('patient', 'mediflow')),
  content            text not null,
  created_at         timestamptz not null default now(),
  constraint mediflow_chat_messages_content_len
    check (char_length(content) between 1 and 8000)
);

-- Idempotency: at most one message per (thread, client_message_id).
create unique index if not exists mediflow_chat_messages_idem
  on public.mediflow_chat_messages (thread_id, client_message_id);

-- Message retrieval: a thread's messages in order.
create index if not exists mediflow_chat_messages_thread_idx
  on public.mediflow_chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuse the shared helper from migration 5).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_mediflow_threads_updated_at on public.mediflow_chat_threads;
create trigger trg_mediflow_threads_updated_at
  before update on public.mediflow_chat_threads
  for each row execute function public.tg_set_updated_at();

-- Bump the parent thread's last_message_at (and updated_at) whenever a message
-- is inserted, so sidebar ordering stays correct without an extra client write.
create or replace function public.tg_mediflow_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mediflow_chat_threads
     set last_message_at = now()
   where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.tg_mediflow_touch_thread() from public, anon;

drop trigger if exists trg_mediflow_touch_thread on public.mediflow_chat_messages;
create trigger trg_mediflow_touch_thread
  after insert on public.mediflow_chat_messages
  for each row execute function public.tg_mediflow_touch_thread();

-- ---------------------------------------------------------------------------
-- Row Level Security — authenticated patients, own data only.
-- ---------------------------------------------------------------------------
alter table public.mediflow_chat_threads enable row level security;
alter table public.mediflow_chat_messages enable row level security;

revoke all on public.mediflow_chat_threads from anon, authenticated;
revoke all on public.mediflow_chat_messages from anon, authenticated;

-- Threads: full own-row CRUD. Messages: insert + read only (immutable; they are
-- removed only by cascade when the owning thread is deleted).
grant select, insert, update, delete on public.mediflow_chat_threads to authenticated;
grant select, insert on public.mediflow_chat_messages to authenticated;

-- Threads ---------------------------------------------------------------------
drop policy if exists mct_select_own on public.mediflow_chat_threads;
create policy mct_select_own on public.mediflow_chat_threads
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

drop policy if exists mct_insert_own on public.mediflow_chat_threads;
create policy mct_insert_own on public.mediflow_chat_threads
  for insert to authenticated
  with check (patient_id = (select auth.uid()) and private.is_patient());

drop policy if exists mct_update_own on public.mediflow_chat_threads;
create policy mct_update_own on public.mediflow_chat_threads
  for update to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient())
  with check (patient_id = (select auth.uid()) and private.is_patient());

drop policy if exists mct_delete_own on public.mediflow_chat_threads;
create policy mct_delete_own on public.mediflow_chat_threads
  for delete to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

-- Messages (own only, via thread ownership) -----------------------------------
drop policy if exists mcm_select_own on public.mediflow_chat_messages;
create policy mcm_select_own on public.mediflow_chat_messages
  for select to authenticated
  using (
    private.is_patient()
    and exists (
      select 1 from public.mediflow_chat_threads t
      where t.id = thread_id and t.patient_id = (select auth.uid())
    )
  );

drop policy if exists mcm_insert_own on public.mediflow_chat_messages;
create policy mcm_insert_own on public.mediflow_chat_messages
  for insert to authenticated
  with check (
    private.is_patient()
    and exists (
      select 1 from public.mediflow_chat_threads t
      where t.id = thread_id and t.patient_id = (select auth.uid())
    )
  );

commit;
