# Qabnah · قبناه

<img src="brand/png/logo-1200.png" alt="Qabnah logo" width="420">

Delivery and e-commerce platform for **Muscat, Oman**. It covers merchant orders (B2C), merchant-initiated deliveries
(e.g. Instagram/WhatsApp sales), and consumer-to-consumer parcels (C2C), on one backend with four surfaces:

| Surface | Tech | Folder |
|---|---|---|
| Qabnah consumer app | iOS SwiftUI · Android Kotlin/Compose | `mobile/ios/QabnahConsumer`, `mobile/android/consumer` |
| Qabnah Captain (courier) app | iOS SwiftUI · Android Kotlin/Compose | `mobile/ios/QabnahCaptain`, `mobile/android/captain` |
| Merchant portal + branded storefront + pay page | React + Vite | `apps/merchant` |
| Admin panel | React + Vite | `apps/admin` |
| API + dispatch worker | Node 22, TypeScript, Fastify, PostgreSQL 16 + PostGIS 3.4 | `backend` |

> **Compliance:** this codebase does not claim regulatory compliance, and no licence, approval, payment-gateway
> account or WhatsApp/SMS credential exists. See [`docs/DECISIONS.md`](docs/DECISIONS.md) (28-item "To validate"
> checklist) and [`docs/research/MARKET_AND_COMPLIANCE_RESEARCH.md`](docs/research/MARKET_AND_COMPLIANCE_RESEARCH.md).

## Documents
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Architecture](docs/ARCHITECTURE.md) · [Decisions & compliance checklist](docs/DECISIONS.md)
- [API contract (OpenAPI 3.1)](API_CONTRACT.yaml) · [Database schema](docs/DATABASE_SCHEMA.md) · [Roles & permissions](docs/USER_ROLES_AND_PERMISSIONS.md)
- [Test plan](docs/TEST_PLAN.md) · [Integrations](docs/INTEGRATIONS.md) · [Market & compliance research](docs/research/MARKET_AND_COMPLIANCE_RESEARCH.md)

## Quick start (Docker)
```bash
cd qabnah/infra
cp .env.example .env            # dev defaults: mock payments, console SMS/WhatsApp, OTP echoed in API responses
docker compose up --build -d    # PostGIS, migrations, sample data (first run only), API :4000, worker,
                                # merchant portal + storefront http://localhost:5173, admin http://localhost:5174
curl localhost:4000/v1/health/ready
node ../backend/scripts/smoke.mjs   # full journey: order → dispatch → delivery → ledger, C2C + online payment
```
Re-seed (wipes data): `SEED_IF_EMPTY=false docker compose run --rm seed`.
Behind a TLS-intercepting proxy, build with `docker build --secret id=extra_ca,src=<ca.crt> -t qabnah/backend:dev ../backend`.

## Local development (without Docker)
```bash
# PostgreSQL 16 with PostGIS on localhost:5432 (postgres/postgres)
cd qabnah/backend && npm install
createdb qabnah    # or: psql -c "CREATE DATABASE qabnah"
npm run seed       # runs migrations + sample data
OTP_DEV_ECHO=true RUN_WORKER_IN_PROCESS=true npm run dev     # API + worker on :4000
npm test           # creates/uses database qabnah_test
```

## Sample accounts (development only, fictional data)
Password for every e-mail account: `Qabnah-Dev-2026!`

| Who | Login |
|---|---|
| Platform staff | `admin@qabnah.test` (super admin), `ops@`, `dispatch@`, `support@`, `review@`, `finance@`, `finance.manager@`, `analyst@` (`@qabnah.test`) |
| Merchants (active) | `owner@saffron-grill.qabnah.test`, `owner@qahwa-house.qabnah.test`, `owner@nakheel-market.qabnah.test`, `owner@ward-flowers.qabnah.test`; cashier `staff@<slug>.qabnah.test` |
| Merchant awaiting approval | `owner@luban-scents.qabnah.test` |
| Consumers (phone OTP) | `+96890000001`, `+96890000002`, `+96890000003` |
| Captains (phone OTP) | `+96890001001` … `+96890001006` (active), `+96890001099` (awaiting review) |

With `OTP_DEV_ECHO=true` the OTP request response includes `devCode`. The fleet partner, CR numbers, IBANs and document
scans in the seed are placeholders.

## What works end to end
- **Auth & RBAC:** phone OTP (consumers, captains), e-mail/password (staff), rotating refresh tokens with reuse
  detection, 8 platform roles and 3 merchant roles, 37 permissions, audit log.
- **Merchants:** self sign-up, KYB documents, approval, branding (logo, cover, colours, taglines, banners), opening
  hours, categories, products with **variants and add-ons**, stock, staff, payment links (with optional
  auto-booked delivery), WhatsApp settings and message log, finance and analytics.
- **Consumers:** store discovery by distance, storefront, server-validated cart pricing (VAT-inclusive, OMR baisa),
  COD or online (mock or Thawani), C2C shipments, live tracking (WebSocket + polling), PIN, rating, support tickets.
- **Captains:** onboarding with 9 document types and expiry, fleet-partner model, zones, weekly availability,
  online/offline, location streaming, offers with countdown, accept/reject/release, step-by-step delivery, PIN or
  photo proof, COD collection, earnings, payouts.
- **Dispatch:** per-zone rules (sequential / broadcast / manual), PostGIS candidate search, scoring, radius
  expansion, offer expiry worker, race-safe acceptance, bike heat-hours blackout, cash-limit and capacity checks,
  manual assignment and re-dispatch by ops.
- **Finance:** append-only ledger posted on delivery, payment-link sales and refunds; settlements with four-eyes
  approval; payout references; COD remittance.
- **Admin:** approvals, live operations map, orders and refunds, zones, pricing rules, dispatch rules, settings,
  plans, support queue, analytics, users, staff and roles, audit log.

## Web apps (development)
```bash
cd qabnah/apps && npm install
npm run dev:merchant     # http://localhost:5173  (storefront: /s/saffron-grill, pay page: /pay/<code>)
npm run dev:admin        # http://localhost:5174
npm run typecheck && npm test && npm run build
QABNAH_API_URL=http://localhost:4000/v1 npm run test:e2e   # Playwright, needs a seeded API
```
Set `VITE_API_URL` (default `http://localhost:4000/v1`) for other environments.

## Mobile apps
- iOS: `cd qabnah/mobile/ios && brew install xcodegen && xcodegen generate && open Qabnah.xcodeproj` — see `mobile/ios/README.md`.
- Android: open `qabnah/mobile/android` in Android Studio — see `mobile/android/README.md`
  (emulator talks to `http://10.0.2.2:4000/v1`).

## Verification status (2026-11-16, real results only)

| Component | Check | Where | Result |
|---|---|---|---|
| Backend | `npm run typecheck` | sandbox + GitHub Actions | ✅ pass |
| Backend | `npm test` — 79 tests (30 unit, 49 integration on PostgreSQL 16 + PostGIS 3.4) | sandbox + GitHub Actions | ✅ 79/79 |
| Backend | Docker image build; `docker compose up` (db, migrate, seed, api, worker) | sandbox + GitHub Actions (build) | ✅ |
| Backend | `scripts/smoke.mjs` full journey against the Docker stack | sandbox | ✅ passed |
| Web | `npm run typecheck` (shared, merchant, admin, e2e) | sandbox | ✅ pass |
| Web | `npm test` — 43 tests (shared 35, merchant 8) | sandbox | ✅ 43/43 |
| Web | Production builds (merchant 629 kB JS / 187 kB gzip, admin 558 kB / 165 kB) + nginx images | sandbox | ✅ |
| Web | Playwright e2e — merchant board accept, admin live ops, storefront → OTP → quote; against the Docker stack (nginx-served apps + compiled API) | sandbox | ✅ 3/3 |
| iOS | `swift test` QabnahKit (52 tests) | Linux sandbox (Swift 6.0.3) + macOS 15 GitHub runner | ✅ |
| iOS | `xcodegen generate` + `xcodebuild` QabnahConsumer & QabnahCaptain (simulator, unsigned) | macOS 15 GitHub runner | ✅ both build |
| Android | `./gradlew :core:test` (48 tests) | sandbox + GitHub Actions | ✅ 48/48 |
| Android | `assembleDebug` consumer & captain APKs | GitHub Actions (Android SDK) | ✅ both build (APK artifact) |

**Not verified / not done:**
- Mobile apps not run on a device or simulator; no UI tests; not signed; no store submission.
- No load test or penetration test.
- No live Thawani, WhatsApp, SMS or push traffic (no credentials).
- Map tiles could not load in the sandbox (OpenStreetMap blocked); production needs a tile provider that permits app traffic.
- Admin MFA not implemented (launch blocker, IMPLEMENTATION_PLAN M10).
- Everything in the DECISIONS compliance checklist is still "To validate" with Omani counsel and regulators.
