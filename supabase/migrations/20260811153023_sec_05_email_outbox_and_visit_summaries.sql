-- =============================================================================
-- MediFlow AI — Security hardening 05: Gmail outbox + agent visit summaries
-- Migration: 20260811153023_sec_05_email_outbox_and_visit_summaries (IDEMPOTENT)
--
-- Req 6: email_outbox — outbound queue the n8n Gmail node polls. Contains
--        recipient emails (PII): RLS on with NO policies => anon/authenticated
--        fully blocked; only service_role (bypass) reaches it. Agent role: none.
-- Req 7: visit_summaries — written by the agent (agent.write_visit_summary),
--        read by the doctor/admin/patient dashboards. Replaces the Google Drive
--        doc. No identity PII.
-- =============================================================================

begin;

-- ---- 5a. Email outbox ----
create table if not exists public.email_outbox (
  id                     uuid primary key default gen_random_uuid(),
  to_email               text not null,
  subject                text not null,
  body                   text not null,
  template               text,
  related_appointment_id uuid references public.appointments(id) on delete set null,
  status                 text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts               int  not null default 0,
  last_error             text,
  created_at             timestamptz not null default now(),
  sent_at                timestamptz
);
comment on table public.email_outbox is
  'Outbound email queue. Contains recipient emails (PII). Readable ONLY by service_role (n8n Gmail node) - RLS on, no API-role policies. The AI agent role has no access.';

create index if not exists email_outbox_pending_idx
  on public.email_outbox (created_at) where status = 'pending';

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- ---- 5b. Visit summaries ----
create table if not exists public.visit_summaries (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null unique references public.appointments(id) on delete cascade,
  patient_user_id uuid not null references auth.users(id) on delete cascade,
  doctor_id       uuid references public.doctors(id) on delete set null,
  summary         text not null check (char_length(summary) between 1 and 20000),
  source          text not null default 'ai_agent' check (source in ('ai_agent','doctor')),
  status          text not null default 'final'    check (status in ('draft','final')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.visit_summaries is
  'AI-generated visit summary per appointment. Written by the agent (agent.write_visit_summary); read by doctor/admin/patient dashboards. No identity PII.';

alter table public.visit_summaries enable row level security;

drop trigger if exists trg_visit_summaries_set_updated_at on public.visit_summaries;
create trigger trg_visit_summaries_set_updated_at
  before update on public.visit_summaries
  for each row execute function public.set_updated_at();

drop policy if exists visit_summaries_select_doctor on public.visit_summaries;
drop policy if exists visit_summaries_select_patient on public.visit_summaries;
drop policy if exists visit_summaries_admin on public.visit_summaries;

create policy visit_summaries_select_doctor on public.visit_summaries
  for select to authenticated
  using ( private.is_doctor()
          and ( doctor_id = private.current_doctor_id()
                or private.doctor_has_patient(patient_user_id) ) );

create policy visit_summaries_select_patient on public.visit_summaries
  for select to authenticated
  using ( patient_user_id = (select auth.uid()) and private.is_patient() );

create policy visit_summaries_admin on public.visit_summaries
  for all to authenticated
  using ( private.is_admin() )
  with check ( private.is_admin() );

grant select on public.visit_summaries to authenticated;

commit;
