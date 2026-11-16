# Qabnah — Decisions Log

Format: ID · decision · context · consequences. Status is one of **Accepted**, **Proposed** (needs a
business or legal owner to confirm), or **Superseded**. Research backing these decisions is in
[`research/MARKET_AND_COMPLIANCE_RESEARCH.md`](research/MARKET_AND_COMPLIANCE_RESEARCH.md). Its
sources are labelled VERIFIED, REPORTED or UNVERIFIED, and most primary pages could only be read
through search-engine extracts because the research environment blocked direct fetches.

> **Compliance disclaimer.** Nothing in this repository is a statement that Qabnah complies with
> Omani law. Every legal and regulatory item below is a requirement to validate with Omani
> counsel and the relevant regulator before launch. No licence, approval or registration has been
> obtained, and no gateway or WhatsApp credential exists in this repository.

## Product and positioning

### D-001 · Position: "the delivery layer for Muscat's merchants and social sellers" (Proposed)
Talabat reportedly holds ~75 % of Oman food aggregation. Competing head-on with a food marketplace
alone is weak. Qabnah leads with what incumbents do poorly:
1. **Merchant-initiated delivery and payment links.** Instagram and WhatsApp sellers (MoCIIP
   reports 3,243 social-media marketing licences) book a captain and send a pay link from one
   screen. A paid link can auto-book the delivery.
2. **Branded storefronts** on `qabnah.om/s/<slug>` with the merchant's logo, colours and banners.
   The merchant owns the customer relationship.
3. **C2C "send anything"** at a fixed, transparent price (Mrsool-style courier bidding is left as a
   later option because consumer-protection price-transparency rules need checking).
4. **Arabic-first, pin-first addresses** with landmark text, built for Muscat's lack of postcodes.
5. **Low, transparent commission** plans (Jahez's original pitch). Subscriptions such as
   HungerStation Pro are a phase-2 lever, not a launch feature.
6. **Compliance as a feature**: verified captains and fleet partners, with licence and document
   expiry tracking.

### D-002 · Three order types share one order + delivery core (Accepted)
`marketplace`, `merchant_delivery` and `c2c` are rows in one `orders` table with a 1:1 `deliveries`
row. Dispatch, tracking, POD and ledger code is shared. Type-specific rules live in the order
service (`modules/orders`).

## Architecture

### D-003 · Modular monolith on Node.js/TypeScript + Fastify (Accepted)
The team is small and the launch is single-city, so one deployable with strict module boundaries
plus a separate worker process from the same image. TypeScript is shared with both web apps, which
lets them share types and the API client. Dispatch and realtime can be split out later behind the
same interfaces.

### D-004 · PostgreSQL 16 + PostGIS, raw SQL with a thin query layer (Accepted)
Geo queries (zone containment, nearest captains) are core. Raw SQL with typed result mappers gives
full PostGIS access without fighting an ORM. Migrations are plain ordered SQL files.

### D-005 · Money as integer baisa, rates as basis points (Accepted)
OMR has three decimals. Integers avoid float drift. Thawani's API also uses integer baisa.

### D-006 · Realtime over WebSocket + Postgres LISTEN/NOTIFY, no Redis (Accepted)
This is enough for launch scale (hundreds of concurrent captains). It removes an infrastructure
dependency. Clients also get a polling endpoint as a fallback. Revisit at >2k concurrent sockets
per instance.

### D-007 · Pluggable provider adapters with safe dev defaults (Accepted)
Payments (`mock`, `thawani`), SMS (`console`, HTTP adapter), WhatsApp (`console`, `cloud`), push
(`console`) and storage (`local`, S3-compatible) all sit behind interfaces. The defaults never call
external services. Production config refuses `OTP_DEV_ECHO=true` and the `mock` payment provider.

### D-008 · Native mobile apps with shared core modules (Accepted)
iOS uses SwiftUI with a local Swift package `QabnahKit`, shared by the Consumer and Captain targets.
Android uses Compose with a pure-Kotlin `:core` module shared by both apps. Network models mirror
`API_CONTRACT.yaml`.

### D-009 · Approximate routing first (Accepted)
Fee and ETA use haversine distance × road factor (1.35) and vehicle speed. A `RoutingProvider`
interface allows OSRM or Google later. ETAs are labelled "approximate". Note D-016: motorcycle
main-road restrictions make straight-line estimates optimistic for bikes, so the bike road factor
defaults to 1.5.

### D-010 · Web apps: React + Vite SPAs; storefront inside the merchant app (Accepted)
The admin panel is a separate build so it can be served on an internal domain behind an
IP allow-list or VPN. The public storefront and pay page ship in the merchant app bundle for
launch. They can be split later for SEO and SSR.

### D-011 · Auth: phone OTP for consumers/captains, email+password for staff (Accepted)
JWT access tokens (15 min) plus rotating refresh tokens with reuse detection. Admin MFA (TOTP) is
a launch blocker tracked in IMPLEMENTATION_PLAN M9. It is not implemented yet.

### D-012 · Hosting region and data residency (Proposed — blocked on legal)
Sources conflict on PDPL cross-border transfer rules (Exec. Reg. 34/2024 Art. 37), and there is a
TRA cloud permit regime. Until counsel answers, design for deploying in an in-country data centre
or a cloud region with an Oman presence. Keep ID documents in object storage that can be relocated.
Retention targets are listed in DATABASE_SCHEMA.md.

## Couriers (captains)

### D-013 · Support both independent captains and fleet partners (Accepted, model Proposed)
Research (REPORTED) finds that since 1 Sep 2025 delivery workers need a Ministry of Labour
professional licence. Expatriate riders reportedly work through licensed delivery companies and
must use motorcycles, Omanisation ratios apply to fleets, and Oman has no freelance visa for
foreigners. The schema therefore supports:
- `captains.employment_model` = `independent` (expected: Omani nationals) or `fleet`
  (attached to a `fleet_partners` row: a licensed delivery company).
- Extra document types: `professional_license` (MoL), `preventive_driving_license`,
  `naql_registration`, plus document expiry dates. Expired documents block going online.
- Configurable rule `require_fleet_for_non_omani` (platform setting, default **true**). A non-Omani
  captain cannot be approved as `independent` while it is on.
Final rules need counsel (checklist items 5–6).

### D-014 · Dispatch: sequential nearest-first by default, configurable per zone (Accepted)
Sequential offers avoid captains racing each other and give fair acceptance stats. Broadcast is
available for peak zones. Manual dispatch is available for ops.

### D-015 · Proof of delivery = 4-digit PIN by default; photo fallback (Accepted)
The PIN is shown to the recipient (or the sender for C2C, who forwards it). If the recipient can't
give the PIN, the captain must attach a photo and ops can review it. COD amount collected is
recorded on the POD.

### D-016 · Heat and road restrictions as dispatch constraints (Accepted, values Proposed)
`dispatch_rules.bike_blackout` (JSON windows, default June–August 12:30–15:30 local) stops offers to
bike captains in those windows. Whether the midday outdoor-work ban covers delivery riders is
UNVERIFIED, so ops can disable it. The motorcycle main-road ban is handled only through the higher
bike road factor in ETA (D-009); true routing is out of scope.

## Payments and finance

### D-017 · Thawani as first online gateway, behind an adapter, unverified (Accepted)
Thawani is Omani and supports OmanNet debit cards, which are reportedly about 95 % of cards. The
adapter follows the public checkout-session API (UAT `https://uatcheckout.thawani.om/api/v1`,
header `thawani-api-key`, `POST /checkout/session`, redirect
`/pay/{session_id}?key={publishable_key}`). Payment confirmation **always** re-fetches the session
server-side. The webhook signature scheme is UNVERIFIED, so webhook bodies are treated only as a
trigger to re-fetch. **Not tested against the Thawani UAT** (no credentials). A backup gateway
(Tap, Amwal, APS) is to be chosen by finance.

### D-018 · No stored-value wallet; internal ledger only (Accepted)
The National Payment Systems Law (RD 8/2018) may treat holding funds for merchants as licensable.
The ledger records obligations, not customer funds. Payouts are executed by finance through the
bank or PSP and recorded with a reference. The preferred end-state is the PSP's split settlement.
Consumer wallets and credits are out of scope until the Central Bank of Oman (CBO) has advised.

### D-019 · COD is first-class with a captain cash ledger (Accepted)
Captains accumulate a negative balance for cash collected. `cod_max_baisa` (platform setting)
caps per-order COD, and `captain_cash_limit_baisa` blocks new COD offers when a captain holds too
much cash. Ops records remittances.

### D-020 · VAT 5 % configurable; merchant prices VAT-inclusive by default (Proposed)
`vat_rate_bps = 500`. Platform fees (delivery fee, service fee, commission) are treated as
VAT-inclusive for consumer display. Who issues the invoice, and agent versus principal treatment,
need tax advice (checklist 16–17). The order data model keeps line-level detail so it can feed
Fawtara e-invoicing later.

### D-021 · Promotions/discount codes deferred (Accepted)
The Consumer Protection Law reportedly requires approval for promotions (Art. 31). `discount_baisa`
exists in the model, but there is no promo-code engine until the process is confirmed.

## Messaging

### D-022 · WhatsApp Cloud API with templates; wa.me deep links always available (Accepted)
Outbound order updates use approved templates outside the 24-hour window. Inbound webhooks are
verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). The Graph
API version lives in config (`WHATSAPP_GRAPH_VERSION`, default `v21.0`; research reports v26.0 is
current, so set it in env). When WhatsApp is not configured, merchants still get `wa.me` share
links for storefronts and payment links.

### D-023 · SMS OTP via generic HTTP adapter (Accepted)
The alphanumeric sender ID must be pre-registered with each Omani operator (REPORTED). The provider
is not chosen yet. The `console` provider logs codes in development.

## Compliance checklist (all: **To validate**)


| # | Requirement | Owner | Status |
|---|---|---|---|
| 1 | Confirm the CR activity codes (ISIC) for marketplace, courier/last-mile and collection agent. Check the foreign-ownership negative list (MD 209/2020 as amended by 435/2024) | Legal | To validate |
| 2 | Get an e-commerce licence under MD 499/2023. Decide whether merchants must each hold one and whether Qabnah must check it | Legal / Eng | To validate |
| 3 | Find out whether Qabnah needs an MTCIT "delivery application" licence under RD 57/2026, and the status of implementing rules | Legal | To validate |
| 4 | Find out whether C2C parcel delivery needs a postal/courier licence (RD 71/2012, TRA Decision 1152/2/19/2024-21, RO 250k investment) or must go through a licensed courier | Legal | To validate |
| 5 | Courier model: can independent Omani couriers contract directly? Must expatriate riders come only through licensed fleet companies? What Omanisation ratio applies (e.g. 20 per 200 motorcycles, supervisor Omanisation)? | Legal / Ops | To validate |
| 6 | Courier onboarding fields: MoL delivery professional licence, driving licence, preventive driving licence, Naql vehicle registration or operating card, nationality and vehicle-type rule | Eng / Ops | To validate |
| 7 | Dispatch and routing: motorcycle main-road ban (Traffic Law Exec. Reg. Art. 39). Midday summer work ban | Eng / Ops | To validate |
| 8 | PDPL: appoint a DPO (Oman-based?), records of processing, consent flows for location, privacy notice in Arabic and English | Legal / Eng | To validate |
| 9 | PDPL: decide whether courier face-match or KYC counts as biometric (sensitive) processing that needs an MTCIT permit. Same for criminal-record checks | Legal | To validate |
| 10 | PDPL: breach response runbook with 72-hour MTCIT notice | Eng / Legal | To validate |
| 11 | Hosting region and cross-border transfer (Exec. Reg. Art. 37, TRA cloud decision, CBO expectations for payment data) | Legal / Eng | To validate |
| 12 | Retention schedule for location history, ID scans and chat logs | Legal / Eng | To validate |
| 13 | Consumer law: Arabic invoice, final OMR price including VAT and delivery fee shown before payment, delivery time disclosure, return and exchange policy per merchant | Legal / Eng | To validate |
| 14 | Consumer law: approval process for promotions and discounts (Art. 31) before launching promo codes | Legal / Ops | To validate |
| 15 | Review the e-contract terms against the new Electronic Transactions Law (RD 39/2025), not the repealed RD 69/2008 | Legal | To validate |
| 16 | VAT: registration, agent or principal treatment of goods versus commission versus delivery fee, invoice issuer | Legal / Finance | To validate |
| 17 | Fawtara e-invoicing phase applicable to Qabnah and to merchants. Keep invoice data model Peppol-ready | Finance / Eng | To validate |
| 18 | Payments: confirm whether marketplace collection, delayed settlement and payout is regulated aggregation or fund holding under RD 8/2018. Prefer PSP split settlement. No stored-value wallet without CBO advice | Legal / Eng | To validate |
| 19 | COD: collection-agent contracts with merchants, courier cash ledger, daily remittance controls | Legal / Ops / Eng | To validate |
| 20 | Thawani: confirm required fields, webhook signature scheme and events, refund API with Thawani (official docs or support). Test in UAT with integer baisa | Eng | To validate |
| 21 | OmanNet support. Choose a primary and a backup gateway (Thawani, Tap, Amwal, APS) | Eng / Finance | To validate |
| 22 | Apple Pay availability through the chosen gateway | Eng | To validate |
| 23 | WhatsApp: Business verification, Arabic and English templates, pin the Graph API version (v26.0 or later), X-Hub-Signature-256 verification | Eng | To validate |
| 24 | SMS: register the alphanumeric sender ID with each Omani operator. Check TRA marketing-message time limits | Ops / Eng | To validate |
| 25 | Addresses: pin plus landmark as the primary address. Optional national-address fields and QR scan (MD 200/2024 programme) | Eng | To validate |
| 26 | Service zones: verify the zone centres and polygons on a map. Phase-1 zones as in section 6 | Ops / Eng | To validate |
| 27 | Cloud or data-centre vendor holds a TRA permit if hosting in Oman (TRA Decision 1152/2/19/2024-20) | Eng / Legal | To validate |
| 28 | Insurance for couriers and goods in transit, and any MTCIT or ROP rules on commercial motorcycle insurance | Legal / Ops | To validate |
