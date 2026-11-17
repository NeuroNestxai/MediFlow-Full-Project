# Qabnah (قبناه) — Architecture

Status: living document. Last updated 2026-11-16.

## 1. System context

```
             ┌────────────────────┐     ┌────────────────────┐
             │ Consumer app       │     │ Captain app         │
             │ iOS (SwiftUI)      │     │ iOS (SwiftUI)       │
             │ Android (Compose)  │     │ Android (Compose)   │
             └─────────┬──────────┘     └─────────┬──────────┘
                       │ HTTPS (REST /v1) + WSS (/v1/realtime)
┌──────────────────┐   │                          │   ┌──────────────────┐
│ Merchant portal  │───┤                          ├───│ Admin panel      │
│ + public         │   ▼                          ▼   │ (React SPA)      │
│ storefront (SPA) │  ┌────────────────────────────┐  └──────────────────┘
└──────────────────┘  │ Qabnah API (Node/Fastify)  │
                      │  modular monolith           │
                      │  ├ REST + WebSocket gateway │
                      │  └ in-process workers       │
                      └──────┬──────────┬──────────┘
                             │          │ adapters (all swappable, mock in dev)
            ┌────────────────▼──┐   ┌───▼─────────────────────────────────────┐
            │ PostgreSQL 16 +   │   │ Payments: Thawani (adapter) / mock / COD │
            │ PostGIS 3.4       │   │ WhatsApp Cloud API (adapter) / console   │
            │ LISTEN/NOTIFY bus │   │ SMS OTP (adapter) / console               │
            └───────────────────┘   │ Push FCM/APNs (adapter) / console         │
                                    │ File storage: local disk / S3-compatible  │
                                    └──────────────────────────────────────────┘
```

## 2. Repository layout

```
qabnah/
├── docs/                    project documents (this file, plan, decisions, schema, roles, tests, research)
├── API_CONTRACT.yaml        OpenAPI 3.1 contract (source of truth for clients)
├── backend/                 Node 22 + TypeScript + Fastify API, migrations, seeds, tests
│   ├── migrations/          ordered SQL migrations (PostGIS)
│   └── src/
│       ├── app.ts           Fastify app factory (used by server and tests)
│       ├── server.ts        HTTP entrypoint
│       ├── worker.ts        background worker entrypoint (dispatch expiry, ETA, settlements)
│       ├── config.ts        env parsing (zod) — fails fast on bad config
│       ├── db/              pool, transaction helper, migration runner
│       ├── lib/             errors, money (baisa), geo, auth/jwt, ids, validation
│       ├── realtime/        event bus (LISTEN/NOTIFY) + WebSocket hub
│       ├── integrations/    payments/, whatsapp/, sms/, push/, storage/  (provider interface + impls)
│       └── modules/         auth, users, addresses, zones, pricing, merchants, catalog, storefront,
│                            orders, deliveries, dispatch, captains, payments, payment-links,
│                            notifications, whatsapp, support, settlements, analytics, admin, files
├── apps/
│   ├── shared/              TS API client, types, i18n (ar/en), UI primitives used by both web apps
│   ├── merchant/            Merchant portal + public branded storefront + payment-link page (Vite/React)
│   └── admin/               Admin panel (Vite/React)
├── mobile/
│   ├── ios/                 XcodeGen project: QabnahConsumer, QabnahCaptain, shared QabnahKit package
│   └── android/             Gradle: :core (pure Kotlin, JVM-tested), :consumer, :captain (Compose)
├── brand/                   logo (SVG), app icons, colour tokens
└── infra/                   docker-compose, Dockerfiles, nginx config, env templates
```

## 3. Backend: modular monolith

One deployable API process plus one worker process built from the same image. Modules own their
tables and expose services to each other through plain TypeScript functions; no module reads another
module's tables directly except through that module's service (enforced by convention + review).
This keeps the option to split dispatch/realtime into separate services later (see DECISIONS D-003).

### Request pipeline
1. `@fastify/helmet`, CORS allow-list, rate limiting (per-IP, stricter on `/auth/*`).
2. Request ID, structured pino logs (PII redaction for phone/email/authorization).
3. Auth hook: `Authorization: Bearer <JWT>` → `req.auth = {userId, roles, permissions, merchantIds, captainId}`.
4. Route-level guards: `requireAuth`, `requirePermission('orders:dispatch')`, `requireMerchantPermission(mid, 'catalog:write')`.
5. zod validation of params/query/body → typed handler.
6. Errors are mapped to a single JSON envelope `{error:{code, message, details?}}`.

### Money
All amounts are integers in **baisa** (1 OMR = 1000 baisa). Never floats. Formatting to `OMR 1.250`
happens only in clients. VAT and commissions are stored in basis points (bps; 500 = 5%) and rounded
half-up to the baisa at line level.

### Geo
PostGIS `geography(Point,4326)` for locations, `geography(Polygon,4326)` for zones.
- Zone resolution: `ST_Covers(zone.boundary, point)`.
- Captain search: `ST_DWithin(captain_locations.location, pickup, radius_m)` ordered by `ST_Distance`
  with a GiST index.
- Routing distance: straight-line distance × configurable road factor (default 1.35) with an
  average speed per vehicle type. A `RoutingProvider` interface allows plugging OSRM/Google later
  (DECISIONS D-009). ETA accuracy is therefore approximate and labelled as such in the UI.

## 4. Core domain flows

### 4.1 Order types
| Type | Who creates | Pickup | Dropoff | Payment |
|---|---|---|---|---|
| `marketplace` (B2C) | consumer in app / storefront | merchant | consumer address | online or COD |
| `merchant_delivery` | merchant in portal (e.g. Instagram/WhatsApp sale) or via paid payment link | merchant | merchant's customer | prepaid externally, or COD collected by captain |
| `c2c` | consumer | sender pin | recipient pin | sender pays online/COD at pickup, or recipient pays COD |

### 4.2 Order state machine (commerce)
```
pending_payment ──paid──▶ placed ──merchant accept──▶ accepted ──▶ preparing ──▶ ready_for_pickup
      │                    │  └─reject──▶ rejected                                   │
      └─expire/cancel─▶ cancelled                                                   ▼
                                        (delivery picked up) ──▶ out_for_delivery ──▶ delivered ──▶ completed
```
`merchant_delivery` and `c2c` orders skip merchant acceptance: they start at `placed` (or
`pending_payment` for online) and move to `ready_for_pickup` immediately so dispatch can start.
Allowed transitions live in one table in `modules/orders/state.ts`, unit-tested exhaustively.

### 4.3 Delivery state machine (logistics)
```
created ─▶ searching ─offer accepted─▶ assigned ─▶ at_pickup ─▶ picked_up ─▶ at_dropoff ─▶ delivered
              │  ▲                        │                         │              └─▶ failed ─▶ returning ─▶ returned
              │  └──── offer expired / captain released ◀───────────┘(before pickup only)
              └─ no captain within max radius ─▶ unassigned (ops queue, manual dispatch)
any pre-pickup state ─▶ cancelled
```

### 4.4 Dispatch engine
Configurable per zone via `dispatch_rules` (falls back to the global rule):
- `strategy`: `sequential` (offer to best candidate, wait `offer_timeout_s`, then next), `broadcast`
  (offer to top N simultaneously, first accept wins — atomic `UPDATE … WHERE captain_id IS NULL`),
  or `manual` (ops/merchant assigns).
- Candidate filter: captain `active`, online, location fresher than `location_max_age_s`, inside one
  of the captain's service zones, within availability schedule (if `respect_schedule`), vehicle
  compatible, `current_load < max_concurrent`, not previously rejected/expired for this delivery.
- Score = `w_distance · (1 − d/radius) + w_rating · rating/5 + w_acceptance · acceptance_rate`.
- Radius expansion: start at `search_radius_km`, grow by `radius_step_km` up to `max_radius_km`;
  after `max_rounds` with no acceptance → `unassigned` + ops alert.
- Dispatch is triggered by: order becoming `ready_for_pickup` (or `accepted` when
  `dispatch_on_accept=true` so the captain arrives as food is ready), an offer expiring/rejected,
  a captain releasing a job, or a manual "re-dispatch" by ops.
- Offer expiry is handled by the worker (`worker.ts`) polling `delivery_offers` every 2 s with
  `FOR UPDATE SKIP LOCKED`, so multiple workers are safe.

### 4.5 Payments
`PaymentProvider` interface: `createCheckout`, `retrieve`, `verifyWebhook`, `refund`.
- `mock` (dev/test): hosted page at `/v1/mock-pay/:id` completes or fails the payment.
- `thawani`: adapter written against Thawani's public checkout-session API; **not verified against
  the sandbox** — no credentials in this repo. Must be certified before go-live.
- `cod`: no gateway; captain collects `cod_amount_baisa`; recorded in the ledger as cash held by the
  captain, cleared when remitted.
Payment confirmation is always server-side (webhook or provider retrieval), never trusted from the
client redirect. Webhook events are stored idempotently in `payment_webhook_events`.

### 4.6 Ledger and settlements
`ledger_entries` is an append-only signed ledger per account (`merchant`, `captain`, `platform`).
Posting happens in the same DB transaction as the business event (delivery completed, payment
captured, refund). Balance = `SUM(amount_baisa)`. Settlements batch unsettled entries for a period
into a `settlements` row (draft → approved → paid) by finance users. Payout execution (bank transfer)
is manual/out of band for MVP; the reference is recorded.

### 4.7 Realtime
- Server-side: every state change publishes an event to Postgres `NOTIFY qabnah_events` (payload =
  event id). All API instances `LISTEN` and push to subscribed WebSocket clients, so horizontal
  scaling needs no Redis.
- Client protocol on `GET /v1/realtime` (WebSocket, JWT via `?token=` or first message):
  `{"type":"subscribe","channel":"order:<id>"}` → server checks authorization for the channel.
  Channels: `order:<id>`, `delivery:<id>`, `merchant:<id>`, `captain:me`, `admin:ops`, `user:me`.
- Captains stream `{"type":"location", lat, lng, heading, speed, accuracy}` over the socket (REST
  fallback `POST /v1/captain/location`). Locations are throttled (≥3 s) and written to
  `captain_locations` (latest) and `delivery_tracks` (only while on a job).
- Mobile apps also poll `GET /orders/:id/tracking` as a fallback when the socket drops.

### 4.8 Notifications
`NotificationService.notify(userId, template, data)` writes an in-app notification and fans out to
push / SMS / WhatsApp providers according to user and merchant preferences. Providers default to
`console` (logs only) in development. WhatsApp outbound uses approved *template* messages outside the
24-hour customer-service window (see research doc).

## 5. Security
- Passwords: bcrypt (cost 12). OTP: 6 digits, SHA-256 hashed with pepper, 5-minute expiry, 5
  attempts, per-phone and per-IP rate limits. Dev mode can echo OTP (`OTP_DEV_ECHO=true`) — must be
  false in production; the config loader refuses to start with it enabled when `NODE_ENV=production`.
- JWT access tokens (HS256, 15 min) + opaque rotating refresh tokens (30 days, SHA-256 hashed in DB,
  reuse detection revokes the family).
- Admin MFA: TOTP second step (`/auth/mfa/*`). Access tokens carry an `amr: ["pwd","otp"]` claim, which platform
  permissions require when `REQUIRE_ADMIN_MFA=true` (mandatory in production).
- Rate limits are keyed per signed-in user, or per IP when anonymous (DECISIONS D-024).
- RBAC: permissions are strings (`resource:action`); roles map to permissions; merchant-scoped roles
  carry `merchant_id`. See USER_ROLES_AND_PERMISSIONS.md.
- Object-level authorization in every service (consumer can only read own orders, captain only
  assigned deliveries, merchant staff only their merchant).
- Uploaded identity documents are private files; served only via short-lived signed URLs to the
  owner and reviewers with `captains:review`.
- Audit log for every admin mutation.
- PII minimisation: captains see the customer's first name + masked phone; full phone is revealed
  only while the delivery is active (a call-masking provider is a later item).

## 6. Deployment (target)
- Containers: `api`, `worker`, `merchant-web`, `admin-web` (static via nginx), `postgres` (managed
  PostGIS in production). Hosting region must satisfy Omani data-protection requirements — see
  DECISIONS D-012 (to be validated with counsel).
- Config via environment variables only (12-factor); `infra/.env.example` documents every variable.
- Health: `GET /v1/health` (liveness), `GET /v1/health/ready` (DB check).

## 7. Clients
- **Web** (merchant, admin): React 18 + Vite + TypeScript + React Router + TanStack Query; Leaflet +
  OpenStreetMap tiles for maps; Arabic (RTL) and English.
- **iOS**: SwiftUI, iOS 16+, async/await `URLSession`, `URLSessionWebSocketTask`, MapKit, Keychain for
  tokens, CoreLocation for captain background updates.
- **Android**: Kotlin, Jetpack Compose, OkHttp + kotlinx.serialization (in a pure-Kotlin `:core`
  module shared by both apps), osmdroid maps (no API key needed), FusedLocation for captains,
  EncryptedSharedPreferences for tokens.
