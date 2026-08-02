-- =============================================================================
-- MediFlow AI — Extend the operational appointment status enum
-- Migration: 20260803000001_extend_appointment_status  (ADDITIVE, IDEMPOTENT)
--
-- Adds the four operational states the Reception queue and Doctor consultation
-- workflow need. Deliberately kept minimal:
--
--   scheduled → confirmed → checked_in → waiting → in_consultation
--             → completed (= consultation completed / ready for checkout)
--             → checked_out
--   cancelled / no_show are terminal branches.
--
-- `completed` is REUSED as "consultation completed"; an appointment that is
-- `completed` but not yet `checked_out` is what Reception shows under
-- "Ready for Checkout". This avoids a redundant state and keeps every existing
-- patient-side label/tone mapping working unchanged.
--
-- These are OPERATIONAL states only — no diagnosis, severity, urgency or
-- triage meaning, per the product's medical-safety boundary.
--
-- NOTE: this migration MUST stay separate from the one that uses these values.
-- PostgreSQL will not let a new enum value be referenced in the same
-- transaction that added it.
-- =============================================================================

-- No explicit `begin`/`commit`: each ALTER autocommits so the new labels are
-- immediately usable by the next migration.

alter type public.appointment_status add value if not exists 'waiting'         after 'checked_in';
alter type public.appointment_status add value if not exists 'in_consultation' after 'waiting';
alter type public.appointment_status add value if not exists 'checked_out'     after 'completed';
alter type public.appointment_status add value if not exists 'no_show'         after 'cancelled';
