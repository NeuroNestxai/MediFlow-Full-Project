-- Local-only stub of the Supabase-managed objects that live OUTSIDE this
-- repo's migrations (auth schema, storage schema, profiles, user_roles,
-- the realtime publication and the anon/authenticated roles).
-- Purpose: apply and test the real migrations against a throwaway Postgres 14
-- cluster before they ever touch the live project.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to authenticated;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Mirrors Supabase: reads the subject claim of the current request.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Created in the Supabase dashboard on the real project, not by a migration.
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  preferred_name text,
  phone          text,
  created_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()));

do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('patient', 'doctor', 'reception');
  end if;
end $$;

-- Mirrors the REAL live table (verified 2026-08-03 against the project):
--   PRIMARY KEY (user_id) — one role per user, NOT a composite key.
-- Getting this wrong locally is what caused the staff-role script to silently
-- discard its inserts, so it is reproduced exactly here.
create table if not exists public.user_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  assigned_at timestamptz default now(),
  assigned_by uuid references auth.users(id),
  constraint user_roles_pkey primary key (user_id)
);
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- The live project has an `on_auth_user_created` trigger on auth.users that
-- creates a profile and assigns the `patient` role to EVERY new account —
-- including staff accounts created from the dashboard. Reproduced so scripts
-- are tested against the same starting conditions.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'patient')
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Minimal storage stub so the patient_documents migration's policies apply.
create table if not exists storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id       uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name     text,
  owner    uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/'); $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
