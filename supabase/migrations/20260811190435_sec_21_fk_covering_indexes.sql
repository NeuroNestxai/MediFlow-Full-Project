-- =============================================================================
-- MediFlow AI — FK covering indexes (advisor polish)
-- Migration: 20260811190435_sec_21_fk_covering_indexes  (IDEMPOTENT)
-- Clears unindexed_foreign_keys advisor lints; covers new tables' FKs. Safe.
-- =============================================================================

create index if not exists idx_doctors_specialty_id                on public.doctors (specialty_id);
create index if not exists idx_services_specialty_id               on public.services (specialty_id);
create index if not exists idx_follow_ups_appointment_id           on public.follow_ups (appointment_id);
create index if not exists idx_pn_related_appointment_id           on public.patient_notifications (related_appointment_id);
create index if not exists idx_pn_related_document_id              on public.patient_notifications (related_document_id);
create index if not exists idx_user_roles_assigned_by             on public.user_roles (assigned_by);
create index if not exists idx_visit_summaries_patient_user_id     on public.visit_summaries (patient_user_id);
create index if not exists idx_visit_summaries_doctor_id           on public.visit_summaries (doctor_id);
create index if not exists idx_email_outbox_related_appointment_id on public.email_outbox (related_appointment_id);
create index if not exists idx_appointments_approved_by            on public.appointments (approved_by);
create index if not exists idx_appointments_rejected_by            on public.appointments (rejected_by);
