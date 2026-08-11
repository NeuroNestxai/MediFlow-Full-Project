-- =============================================================================
-- MediFlow AI — Human-in-the-loop: add 'rejected' appointment status
-- Migration: 20260811173403_sec_11_add_rejected_status  (IDEMPOTENT)
--
-- Terminal state for an appointment request that admin/reception declines.
-- Kept separate from the migration that uses it (Postgres enum rule). No
-- begin/commit — the ALTER autocommits.
-- =============================================================================

alter type public.appointment_status add value if not exists 'rejected' after 'pending_approval';
