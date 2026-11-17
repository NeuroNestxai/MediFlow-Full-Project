# Qabnah — Test Plan

## 1. Levels

| Level | Tool | Where | Runs against |
|---|---|---|---|
| Unit | Vitest | `backend/test/unit` | Pure functions: money/VAT rounding, pricing rule selection, fee formula, state machines, dispatch scoring, option validation, phone normalisation, signature verification |
| Integration / API | Vitest + Fastify `inject` + real PostGIS | `backend/test/integration` | Every module through HTTP with a fresh database per test file (template DB cloned per run) |
| End-to-end (API) | Vitest | `backend/test/e2e` | Full journeys across roles: merchant onboarding → approval → catalog → consumer order → merchant accept → dispatch → captain POD → ledger → settlement |
| Realtime | Vitest + `ws` client against a listening server | `backend/test/integration/realtime.test.ts` | Subscribe authorization, event delivery on status change |
| Web components | Vitest + Testing Library | `apps/*/src/**/*.test.tsx` | Money formatting, cart option selection, RTL switching, route guards |
| Web E2E smoke | Playwright (pre-installed Chromium) | `apps/e2e` | Merchant login → orders board; admin login → live ops; storefront → add to cart |
| Mobile | XCTest (QabnahKit), JUnit (`:core`) | `mobile/ios/QabnahKit/Tests`, `mobile/android/core/src/test` | JSON decoding of contract fixtures, money formatting, state helpers |
| Contract | Script | `backend/test/contract.test.ts` | Every route registered in the API exists in `API_CONTRACT.yaml` (and vice versa, for documented paths) |

## 2. Test data & environment
- `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/qabnah_test`).
- Global setup drops and recreates the test database, runs migrations, and each suite truncates
  mutable tables. Factories in `test/helpers` create users, merchants, captains and orders.
- External providers are always `mock`/`console` in tests; time-sensitive logic (offer expiry) uses
  an injectable clock or explicit DB timestamps.

## 3. Critical scenarios (must pass)

### Auth & RBAC
- OTP: request → verify creates user; wrong code increments attempts; 6th attempt blocked; expired code rejected; rate limit per phone.
- Refresh rotation: old refresh token reuse revokes the family.
- Staff login wrong password → 401 without revealing which field was wrong.
- Permission checks: dispatcher cannot change pricing (403); merchant staff of store A cannot read store B orders (403); support agent cannot approve captains.
- Suspended user cannot authenticate or use existing access token.

### Catalog & storefront
- Variant group with min=max=1 requires exactly one option; add-on max enforced; unavailable option rejected; price = base + deltas.
- Storefront hides inactive categories/products, unapproved merchants return 404.

### Pricing
- Most specific rule wins (zone+type+vehicle > zone+type > global); min/max fee clamps; surge multiplier; distance beyond `max_distance_km` → 422 `out_of_service_area`; point outside all zones → 422.

### Orders
- Marketplace COD order: totals correct (subtotal + delivery + service fee), VAT computed as included; COD amount = total.
- Online order starts `pending_payment`; mock payment success → `placed`; payment failure leaves it unpaid; webhook replay is idempotent.
- Idempotency-Key returns the same order on retry.
- Closed merchant / below minimum order → 422.
- Merchant accept → preparing → ready; invalid transitions → 409.
- Consumer cancel allowed only before acceptance.
- C2C shipment and merchant delivery start dispatch immediately.

### Dispatch
- Candidates exclude: offline, stale location, outside zones, wrong vehicle, at capacity, previously declined, non-active, expired documents, bike during blackout window.
- Nearest/highest score gets the first offer; rejection → next candidate; expiry worker expires and re-offers; radius expands per round; after max rounds → `unassigned`.
- Two captains accepting the same broadcast delivery → exactly one succeeds (409 for the other).
- Manual assignment by dispatcher cancels pending offers.

### Delivery execution
- Captain can only act on own assigned delivery; sequence enforced (cannot pick up before arriving).
- Completion requires correct PIN (or photo when PIN not provided); wrong PIN → 422.
- Release before pickup returns delivery to dispatch.
- Tracking endpoint exposes captain location only to the order's customer while active.

### Finance
- Ledger postings for each scenario in DATABASE_SCHEMA §Ledger sum to the expected balances.
- Settlement generation includes only unsettled entries in period; approval by creator rejected; mark-paid requires reference.
- COD remittance reduces captain debt.
- Refund ≤ captured amount; partial refund sets `partially_refunded`.

### Messaging & support
- WhatsApp webhook: GET verification echoes challenge only with correct token; POST with bad signature → 401; valid → stored inbound message.
- Requester can't see internal notes; staff can.

### Realtime
- Subscribing to another customer's order channel → `error forbidden`; own order receives `order.status_changed` after merchant accepts.

## 4. Non-functional
- **Load (executed 2026-11-17, `backend/scripts/loadtest.mjs`):**
  - Setup: autocannon, 15 s per scenario, against the compiled API and the Docker PostGIS database, all on one
    4-vCPU sandbox (load generator included).
  - Rate limits were raised for the run.

  | Scenario | Connections | Avg req/s | p50 | p97.5 | p99 | Errors |
  |---|---|---|---|---|---|---|
  | `GET /stores` near a point (public, PostGIS distance) | 50 | 2,091 | 21 ms | 44 ms | 51 ms | 0 |
  | `POST /quotes/delivery` (zone lookup + pricing) | 50 | 2,177 | 20 ms | 42 ms | 49 ms | 0 |
  | `POST /captain/location` (authenticated write + realtime outbox) | 20 | 484 | 5 ms | 230 ms | 308 ms | 0 |

  - The location test sends every request for one captain row, so its tail latency mostly reflects lock
    contention on that row. Real traffic is many captains, each pinging every ≥5 s; 484 writes/s corresponds to
    about 2,400 online captains.
  - Not yet done: a multi-captain soak test, and tests on production-sized hardware.
- **Rate limiting** (manual check): one user hit HTTP 429 after the configured limit, while another user on the
  same IP was unaffected (D-024).
- Security: OWASP ASVS L2 checklist, dependency audit (`npm audit`), external pen test before launch.
- Accessibility: WCAG 2.1 AA review of web apps; Dynamic Type & TalkBack/VoiceOver on mobile.
- Localisation: Arabic RTL screenshots for every screen.

## 5. Reporting
Test results are reported exactly as produced by the runners. The README "Verification status" table
lists what was executed in the build environment and what was not (e.g. iOS/Android UI builds need
Xcode / Android SDK).
