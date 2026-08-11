# MediFlow — Human-in-the-loop appointments & no-show policy

Answers the evaluator note: *"Add a human-in-the-loop verification step before any
appointment is finalized, and define how no-shows are handled."*

## 1. The rule

**No appointment is ever finalized automatically.** Every appointment — whether a
patient books it directly, or the AI agent creates it — is forced into
`pending_approval` on insert. Only **admin or reception** can move it forward.

This is enforced in the database, not just the UI:
- A `BEFORE INSERT` trigger (`appointments_force_pending`) overwrites the status
  to `pending_approval` on every insert, ignoring whatever was passed.
- There is **no** INSERT/UPDATE RLS policy on `appointments`, so clients cannot
  change status directly. The only way to `scheduled` is `approve_appointment()`.

## 2. The lifecycle

```
 (patient books, or agent books)
            │  insert  → trigger forces →  pending_approval
            ▼
   pending_approval ──approve_appointment()──►  scheduled  ──► checked_in ─►
        │   (admin/reception)                    (confirmed email sent)   waiting ─►
        │                                                                 in_consultation ─►
        └──reject_appointment(reason)──►  rejected (terminal)             completed ─► checked_out
                (admin/reception)          (rejection email sent)
                                                                          (no_show = terminal)
```

| Step | Who | Function | Result |
|---|---|---|---|
| Book (direct or agent) | patient / agent | `create_patient_appointment(...)` or any insert | always `pending_approval` |
| **Approve** | admin / reception | `approve_appointment(appointment_id)` | `scheduled`; records `approved_by/at`; queues **confirmation email** with full details |
| **Reject** | admin / reception | `reject_appointment(appointment_id, reason)` | `rejected`; records `rejected_by/at/reason`; queues **rejection email** |

## 3. What the patient sees

`public.dashboard_patient_appointments` exposes `status` (`pending_approval`,
`scheduled`, `rejected`, …) plus `approved_at`, `rejected_at`, and
`rejection_reason`. In-app notifications are also created at each step
(`appointment_requested`, `appointment_confirmed`, `appointment_rejected`, …).

Suggested UI labels: `pending_approval` → "Awaiting approval",
`scheduled` → "Approved / Confirmed", `rejected` → "Not approved" (show reason).

## 4. The email

On approve/reject, a row is inserted into `public.email_outbox` (status
`pending`). The **n8n Gmail node** (running as `service_role`) polls that table
and sends the email — so the confirmation goes out within seconds of approval.
The email body already contains reference, date, time, doctor, and service.

## 5. Staff queue

`public.dashboard_pending_approvals` lists everything awaiting a decision (admin
+ reception). Wire the dashboard's Approve/Reject buttons to the two RPCs above.

## 6. No-show handling (defined)

A no-show = an **approved** appointment (`scheduled`/`confirmed`/`checked_in`/
`waiting`) where the patient does not attend.

| Who | Function | From states | To |
|---|---|---|---|
| Reception | `staff_update_queue_status(id, 'no_show')` | scheduled, confirmed, checked_in, waiting | `no_show` |
| Doctor | `doctor_mark_no_show(id)` | scheduled, confirmed, checked_in, waiting | `no_show` |

Effects: `no_show` is terminal; the slot is freed for reuse; the patient gets an
`appointment_no_show` notification. A `pending_approval` request can never become
a no-show (it was never confirmed) — reject or approve it first.

Optional future enhancement: an automatic sweep (pg_cron) that marks appointments
`no_show` if not checked in within N minutes after the start time. Not enabled
yet — add it if the clinic wants hands-off no-show detection.
