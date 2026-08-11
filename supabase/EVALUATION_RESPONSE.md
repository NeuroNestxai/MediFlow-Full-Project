# MediFlow — Response to the preliminary evaluation

Maps each evaluator recommendation to what was done in the database, an honest
score estimate, and the remaining gaps. English only.

## 1. Recommendation-by-recommendation

| Evaluator recommendation | Status | What we did / what's missing |
|---|---|---|
| Never send patient identity to the LLM; strip name, share symptoms only | Covered (DB) | Agent role `mediflow_agent` sees only patient_id + symptoms + clinical. Real once n8n uses that role, not service_role. |
| Display a clear data-use disclaimer | Partial | Frontend text task. (Optional DB add: `patient_consents` record — see §3.) |
| Human-in-the-loop before any appointment is finalized | Covered | Force-pending + admin/reception approve/reject + email. Impossible to bypass. |
| Define how no-shows are handled | Covered | Doctor/reception mark no-show; documented policy. |
| Integrate with existing booking systems | Not covered | Product/architecture decision. Outbox + clean RPCs make integration easier. |
| Raise core value (voice, fewer questions, curated list) | Not covered | Product/UX + AI feature. |
| Move beyond prompt engineering | Not covered | ML/data strategy. |

Extra (beyond the recommendations): cancellation waitlist that auto-fills freed
slots with patient choice + admin approval + email.

## 2. Honest score estimate

Baseline weighted total ~2.76 / 5.

| Category | Weight | Now | After our DB work | Cap |
|---|---|---|---|---|
| AI Safety, Ethics & Oversight | 15% | 1.75 | 3.5 - 4.0 | UI disclaimer + n8n role swap |
| Technical Product | 25% | 2.5 | 3.0 - 3.25 | "Prompted, not trained" (ML) |
| Impact & Business Viability | 25% | 3.5 | 3.6 - 3.8 | No booking-system integration |
| Relevance & Innovation | 20% | 2.75 | 3.0 - 3.1 | Core value (voice/curated) |
| Team & Future Plans | 10% | 2.75 | 3.0 | Roadmap |
| Pitch Quality | 5% | 3.5 | 3.75 | - |

Realistic overall ~3.1 - 3.4 (about +0.4 to +0.6) if the wiring + disclaimer +
demo are done. AI Safety & Ethics is the biggest, near-certain gain.

## 3. Recommended further DB work (optional, to strengthen ethics/oversight)

| # | Item | Adds | Effort |
|---|---|---|---|
| 1 | `patient_consents` (data-use disclaimer record, versioned) | Ethics; the disclaimer they asked for | Low |
| 2 | `audit_log` + hooks (civil-ID decrypt, approvals, agent writes) | Oversight, non-repudiation | Med |
| 3 | Require MFA (AAL2) for civil-ID decrypt + approvals | Ties MFA to crown-jewel actions | Low-Med |
| 4 | pg_cron: auto no-show sweep + auto-expire offers | Completes no-show story | Med |
| 5 | Anti-abuse: cap open pending requests per patient | Blocks booking spam | Low |
| 6 | `admin_delete_patient_data` (right-to-erasure, keep audit) | Compliance | Med |
| 7 | Patient transparency view (what the AI receives) | Trust | Low |
| 8 | Advisor polish (FK indexes, consolidate RLS) | Cleanliness | Low |

Recommended bundle for maximum evaluation lift: #1 + #2 + #3 + #4.

## 4. Not our scope (product/ML/UX — for the team)
- Booking-system integration (biggest business lever).
- Voice intake + curated doctor list (core value).
- Beyond prompt engineering: a data/ML plan for scale.
- UI data-use disclaimer text.
