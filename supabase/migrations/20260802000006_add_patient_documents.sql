-- =============================================================================
-- MediFlow AI — Private Patient Documents (Supabase Storage + metadata)
-- Migration: 20260802000006_add_patient_documents  (ADDITIVE, IDEMPOTENT)
--
-- Creates a PRIVATE Storage bucket `patient-documents` (10 MB limit, PDF/image
-- only) and a metadata table public.patient_documents. Files live under a
-- per-user folder prefixed with the owner's auth.uid(); patients can only touch
-- their own folder/rows. Clinic-provided rows are read-only to the patient.
--
-- SAFETY: additive; single transaction; RLS on the metadata table and on
-- storage.objects (scoped to this bucket). No anon access, no service-role.
-- =============================================================================

begin;

-- 1. Private bucket with size + type limits (defense in depth alongside the UI).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents', 'patient-documents', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Metadata table.
create table if not exists public.patient_documents (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.profiles(id) on delete cascade,
  original_filename text not null check (char_length(original_filename) <= 255),
  storage_path      text not null unique,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  source_type       text not null default 'patient_uploaded'
                      check (source_type in ('patient_uploaded', 'clinic_provided')),
  created_at        timestamptz not null default now()
);

create index if not exists patient_documents_patient_idx on public.patient_documents (patient_id);

alter table public.patient_documents enable row level security;

revoke all on public.patient_documents from anon, authenticated;
grant select, insert, delete on public.patient_documents to authenticated;

-- Patients read only their own metadata (both patient_uploaded + clinic_provided).
drop policy if exists patient_documents_select_own on public.patient_documents;
create policy patient_documents_select_own on public.patient_documents
  for select to authenticated
  using (patient_id = (select auth.uid()) and private.is_patient());

-- Patients may create only their own patient_uploaded rows, and only pointing
-- at a storage_path inside their own folder (no misleading metadata rows).
drop policy if exists patient_documents_insert_own on public.patient_documents;
create policy patient_documents_insert_own on public.patient_documents
  for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and private.is_patient()
    and source_type = 'patient_uploaded'
    and storage_path like ((select auth.uid())::text || '/%')
  );

-- Patients may delete only their own patient_uploaded rows (clinic files stay).
drop policy if exists patient_documents_delete_own on public.patient_documents;
create policy patient_documents_delete_own on public.patient_documents
  for delete to authenticated
  using (
    patient_id = (select auth.uid())
    and private.is_patient()
    and source_type = 'patient_uploaded'
  );

-- 3. Storage object policies (scoped to this bucket + the caller's own folder).
--    Path convention: '<auth.uid()>/<random>.<ext>'.
drop policy if exists patient_documents_objects_select on storage.objects;
create policy patient_documents_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_patient()
  );

drop policy if exists patient_documents_objects_insert on storage.objects;
create policy patient_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_patient()
  );

-- Delete is allowed for the caller's own folder, EXCEPT objects linked to a
-- clinic_provided metadata row (those stay read-only). Objects with no metadata
-- row at all — e.g. an orphan from a failed upload — remain deletable, so
-- failed-upload cleanup still works.
drop policy if exists patient_documents_objects_delete on storage.objects;
create policy patient_documents_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_patient()
    and not exists (
      select 1
      from public.patient_documents d
      where d.storage_path = name
        and d.patient_id = (select auth.uid())
        and d.source_type = 'clinic_provided'
    )
  );

commit;
