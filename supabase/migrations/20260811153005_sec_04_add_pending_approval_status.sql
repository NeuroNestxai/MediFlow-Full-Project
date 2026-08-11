-- =============================================================================
-- MediFlow AI — Security hardening 04: add 'pending_approval' status
-- Migration: 20260811153005_sec_04_add_pending_approval_status  (IDEMPOTENT)
--
-- Req 6: a human-in-the-loop state ordered BEFORE 'scheduled'. Patient bookings
-- enter here; admin approval flips them to 'scheduled' (see sec_06).
--
-- NOTE: this migration MUST stay separate from the one that uses the value.
-- PostgreSQL will not let a new enum value be referenced in the same
-- transaction that added it. No begin/commit — the ALTER autocommits.
-- =============================================================================

alter type public.appointment_status add value if not exists 'pending_approval' before 'scheduled';
