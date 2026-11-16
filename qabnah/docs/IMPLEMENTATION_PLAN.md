# Qabnah — Implementation Plan

Goal: a working, testable platform for a Muscat pilot: consumer, captain, merchant and admin
surfaces on one backend, with B2C, merchant-initiated and C2C deliveries running end to end.

Each milestone is done only when its automated tests pass in CI (`npm test` in `backend/` against
PostGIS) and the docker stack boots with sample data. The progress column is updated honestly,
and the full status table with what was verified is in the repository `README.md`.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| M0 | Foundations | Docs (this set), research, repo layout, Docker dev stack, brand assets | `docker compose up` gives API + DB + web apps; docs reviewed |
| M1 | Identity & RBAC | Users, OTP login, email/password login, JWT + refresh rotation, roles/permissions, audit log | Auth + RBAC test suites green |
| M2 | Geography & pricing | Zones (PostGIS), pricing rules, delivery quotes, platform settings | Quote tests: zone matching, rule specificity, min/max/surge |
| M3 | Merchants & catalog | Merchant sign-up, KYB docs, approval, branding, banners, categories, products, variants/add-ons, public storefront | Catalog + storefront tests, option validation tests |
| M4 | Orders | Marketplace checkout pricing, order placement (COD/online), merchant processing, state machine, C2C shipments, merchant-initiated deliveries | State-machine unit tests; order flow integration tests |
| M5 | Captains & dispatch | Captain onboarding + documents + review, zones, availability, online/offline, location, dispatch engine (sequential/broadcast/manual), offers, expiry worker | Dispatch tests (candidate filtering, radius expansion, expiry, race on accept) |
| M6 | Delivery execution & tracking | Delivery status flow, PIN/photo POD, tracking endpoint, WebSocket realtime, ETA | E2E: order → dispatch → POD; realtime subscription authz test |
| M7 | Payments & finance | Payment provider interface, mock provider + hosted page, Thawani adapter, webhooks, refunds, ledger postings, settlements, COD remittance, payment links | Ledger posting tests per scenario; webhook idempotency; settlement four-eyes |
| M8 | Engagement & support | Notifications (in-app + push/SMS/WhatsApp adapters), WhatsApp webhook + templates, support tickets, ratings, analytics | Tests for WhatsApp signature, tickets visibility, analytics sums |
| M9 | Clients | Merchant portal + storefront + pay page; Admin panel; iOS Consumer & Captain; Android Consumer & Captain | Web: build + component tests + Playwright smoke against stack. Mobile: see README for what was compiled |
| M10 | Launch readiness (NOT done in this build) | Admin TOTP MFA, Thawani UAT certification, WhatsApp template approval, SMS provider contract, PDPL DPIA, pen test, load test, store submissions, legal sign-off on DECISIONS checklist | Human owners; see DECISIONS compliance checklist |

## Work breakdown — backend modules

```
auth        OTP request/verify, login, refresh, logout, merchant self-registration
users       /me, addresses, devices, notifications inbox
files       multipart upload, local/S3 storage, signed URLs
zones       public list, admin CRUD, point → zone resolution
pricing     rule resolution, fee + ETA quote, platform settings
merchants   profile/branding/hours, banners, staff, KYB documents, admin lifecycle, plans
catalog     categories, products, option groups (variants/add-ons)
storefront  public store listing + branded storefront payload
orders      cart pricing, placement (marketplace, c2c, merchant_delivery), state machine, merchant actions, cancel
deliveries  delivery creation, captain actions, POD, tracking, admin assign
dispatch    candidate search, scoring, offers, expiry worker, radius expansion
captains    onboarding, documents, zones, availability, status, location, earnings
payments    providers (mock, thawani), checkout, webhooks, refunds
paylinks    merchant payment links + public pay page + delivery on payment
ledger      postings, balances, settlements, COD remittance
notify      in-app + channel fan-out, WhatsApp/SMS/push adapters, WhatsApp webhook
support     tickets + messages
analytics   platform + merchant KPIs
admin       users, staff & roles, settings, audit log, live ops
realtime    event outbox, LISTEN/NOTIFY, WebSocket hub & channel authorization
```

## Sample data (seed)
`npm run seed` creates a reproducible pilot dataset. Every account is clearly fake, uses `+968 9000 xxxx`
phone numbers and `@qabnah.test` e-mails, and has dev-only passwords listed in `README.md`:
- 11 Muscat zones (approximate polygons around district centres from the research doc; ops must
  redraw them on a map before use).
- Pricing rules (bike/car, per type), global dispatch rule, platform settings, 2 plans.
- 4 merchants (restaurant, café, grocery, flower shop) with branding, banners, categories,
  products, variants and add-ons.
- 6 captains (mixed bike/car, independent and fleet), with approved documents, zones and
  locations, and 1 pending captain to review.
- Consumers with addresses; historical orders across all three types and statuses, which produce
  ledger entries.
- Platform staff users for each admin role.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Courier licensing / Omanisation rules make the independent model non-viable | Fleet-partner model is already in the schema (D-013); rules are configurable |
| Gateway integration differs from public docs | Adapter isolated; payment confirmed by server-side re-fetch; mock used for all tests |
| Straight-line ETA inaccuracy | Labelled approximate; `RoutingProvider` interface ready for OSRM |
| Address ambiguity | Pin-first, landmark text, call/WhatsApp-the-recipient buttons in the captain app |
| Single-process realtime scaling | LISTEN/NOTIFY fan-out across instances; polling fallback |
