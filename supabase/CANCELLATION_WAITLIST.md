# MediFlow — Cancellation waitlist (auto-offer freed slots)

Turns a cancellation into a filled slot. Opt-in (Option A), cascade on decline,
24-hour offer expiry. Every move still passes through admin/reception approval
(reuses the human-in-the-loop flow) and sends an email on approval.

## Flow

```
Patient A cancels (scheduled/confirmed)
        │  AFTER UPDATE trigger: trg_appointments_offer_on_cancel
        ▼
 open_slot_offer_for_slot(doctor, freed date/time)
        │  picks the top-priority OPTED-IN patient whose current appointment
        │  with that doctor is LATER than the freed slot (soonest such patient first)
        ▼
 slot_offers row = 'offered'  +  in-app notification to Patient B
        │
 Patient B: respond_slot_offer(offer, accept?)
   ├── decline / expire ──► cascade: offer the slot to the next opted-in patient
   └── accept ──► 'accepted'  (waiting for staff)
        │
 Admin/reception: approve_slot_offer(offer)  ──► move B's appointment to the freed
        │                                        slot + email + B's OLD slot cascades
        └── reject_slot_offer(offer, reason) ──► no change + notify B + cascade slot
```

## Objects

| Purpose | Name | Type | Who |
|---|---|---|---|
| Opt-in flag | `appointments.wants_earlier` | column | patient sets via RPC |
| Offers table | `slot_offers` | table | read: candidate (own) + admin/reception; write: functions only |
| Patient opts in/out | `patient_set_wants_earlier(appointment_id, wants)` | function | patient (own) |
| Patient responds | `respond_slot_offer(offer_id, accept)` | function | patient (candidate) |
| Staff approves move | `approve_slot_offer(offer_id)` | function | admin / reception |
| Staff rejects move | `reject_slot_offer(offer_id, reason)` | function | admin / reception |
| Auto-offer on cancel | `open_slot_offer_for_slot(...)` + `tg_appointments_offer_on_cancel` trigger | function/trigger | system |
| Expire stale offers | `expire_stale_slot_offers()` | function | admin/reception or backend/cron |
| Patient's offers | `dashboard_my_slot_offers` | view | patient |
| Staff approval queue | `dashboard_slot_offers_pending` | view | admin / reception |

## Priority rule (Option A — opt-in)

Only patients who set `wants_earlier = true` are offered a freed slot. Among
them (same doctor, current appointment later than the freed slot), the one whose
current appointment is **soonest** is offered first. A patient is never offered
the same slot twice, and never holds two active offers at once.

## Frontend / n8n wiring

- Patient page: a "notify me if an earlier slot opens" toggle -> `patient_set_wants_earlier`;
  an offer card (from `dashboard_my_slot_offers`) with **Move up** / **Keep** ->
  `respond_slot_offer(offer, true/false)`.
- Staff page: `dashboard_slot_offers_pending` with **Approve** / **Reject** ->
  `approve_slot_offer` / `reject_slot_offer`.
- Email: the same `email_outbox` + n8n Gmail node (template `appointment_moved_earlier`).
- Expiry: call `expire_stale_slot_offers()` on a schedule (n8n cron or pg_cron).
  Offers also expire lazily when a patient tries to respond after 24h.

## Verified (rolled back)

Create two appointments (same doctor) -> cancel the earlier one -> offer auto-
created for the opted-in later patient -> patient accepts -> admin approves ->
patient moved to the earlier slot + move-email queued. All statuses correct.
