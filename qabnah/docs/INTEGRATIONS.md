# Qabnah — External Integrations

Every external dependency sits behind an adapter with a safe local default, so the whole platform runs and is
tested with **no external accounts**. This page lists, per integration, what code exists, how to switch it on,
and what has and has **not** been verified.

> No credentials, merchant accounts, sender IDs, WhatsApp templates or regulatory approvals exist in this
> repository. Nothing below has been tested against a live third-party system.

| Integration | Default (dev/test) | Production adapter | Status |
|---|---|---|---|
| Online payments | `mock` hosted page (`/v1/mock-pay/:id`) | `thawani` (`backend/src/integrations/payments/thawani.ts`) | Adapter written from public docs; **not run against Thawani UAT** |
| Cash on delivery | Built in | Built in | Implemented + tested (captain cash ledger, remittance) |
| SMS OTP | `console` (logs the code; dev can echo it) | `http` generic gateway | Provider not chosen; payload must be adapted |
| WhatsApp | `console` (logs + `outbound_messages` row) | `cloud` (Meta Cloud API) | Webhook signature/challenge tested locally; **no live sends** |
| Push notifications | `console` | `live`: FCM HTTP v1 (Android) + APNs token auth (iOS) | Implemented; signing and invalid-token cleanup unit-tested; **no live sends** (no Firebase/Apple keys) |
| Maps / routing | Haversine × road factor | `osrm` (self-hosted OSRM, Oman extract) with automatic fallback | Implemented and tested against a mock OSRM server; Oman data build (`infra/osrm/prepare.sh`) not run here |
| Map tiles (web/Android) | OpenStreetMap tiles via Leaflet / osmdroid | Same (check OSM tile usage policy; use a commercial tile provider at scale) | — |
| Map (iOS) | Apple MapKit | Same | — |
| File storage | Local disk (`STORAGE_DIR`) | `s3` (AWS S3 / MinIO / R2 / regional S3-compatible) | Implemented; put/get/delete tested against the s3rver emulator |

---

## 1. Payments

### Flow (all providers)
1. `POST /v1/orders/{id}/checkout` (or `/v1/pay/{code}/checkout` for payment links) creates a `payments` row and a
   provider checkout session, then returns `checkoutUrl`.
2. The customer pays on the provider's hosted page and is redirected to `successUrl` or `cancelUrl`.
3. **Confirmation is always server-side.** Redirects (`GET /v1/payments/return`), the polling endpoint
   (`GET /v1/payments/{id}`) and webhooks (`POST /v1/webhooks/payments/{provider}`) all call `syncPayment()`. That function
   re-fetches the session from the provider and applies the result exactly once (row lock + status guard).
   Webhook bodies are stored in `payment_webhook_events` (unique per body hash) and are only used as a trigger.
4. Paid order → `placed` → merchant notified, or dispatch starts for C2C. A payment that arrives after the order was
   cancelled is refunded automatically.
5. Refunds: `POST /v1/admin/orders/{id}/refund` (full/partial, capped at the captured amount). Cancelling or
   rejecting a paid order refunds it in full.

### Mock provider (default)
- `PAYMENT_PROVIDER=mock`. The checkout URL opens a "TEST MODE" page with **Pay** / **Decline** buttons.
- `POST /v1/mock-pay/{paymentId}/complete {"outcome":"paid"|"failed"}` does the same thing programmatically.
- The config loader refuses `mock` when `NODE_ENV=production`.

### Thawani (Oman)
- `PAYMENT_PROVIDER=thawani`, `THAWANI_SECRET_KEY`, `THAWANI_PUBLISHABLE_KEY`,
  `THAWANI_BASE_URL` (UAT default `https://uatcheckout.thawani.om/api/v1`) and `THAWANI_CHECKOUT_URL`
  (UAT default `https://uatcheckout.thawani.om/pay`).
- Calls: `POST /checkout/session` (header `thawani-api-key`, body `client_reference_id`, `mode: payment`,
  `products[{name, quantity, unit_amount (baisa)}]`, `success_url`, `cancel_url`, `metadata`), then redirect to
  `{checkout}/{session_id}?key={publishable}`; confirmation via `GET /checkout/session/{id}` → `payment_status`.
- **Refunds:** the Thawani refund API was not verified, so refunds are recorded as `pending` for finance to process
  in the Thawani portal (`refunds.status`).
- **Webhooks:** the signature scheme is unverified (research §4.1). The endpoint only re-fetches the session, so
  a forged webhook cannot mark anything paid.
- **To go live:** get UAT keys → run an order and a payment link through UAT → confirm the required fields, the refund
  API, the webhook format and the OmanNet debit card flow → switch to production keys. See DECISIONS D-017 and
  checklist items 18–22.

## 2. SMS OTP
- `SMS_PROVIDER=console` logs `Qabnah code: NNNNNN`. With `OTP_DEV_ECHO=true` the API also returns `devCode` (dev only,
  refused in production).
- `SMS_PROVIDER=http` POSTs `{to, from: SMS_SENDER_ID, text}` with `Authorization: Bearer SMS_HTTP_TOKEN` to `SMS_HTTP_URL`.
  Adjust `backend/src/integrations/sms.ts` to the contracted provider's API.
- Before launch: register the alphanumeric sender ID with each Omani operator (reported requirement; checklist item 24).
- OTP hardening: 6 digits, SHA-256 + pepper, 5-minute expiry, 5 attempts, 30 s resend cooldown, 5 codes per 15 min
  per phone, per-IP rate limit. The SMS body is not stored (`outbound_messages.body = [redacted]`).

## 3. WhatsApp Business Platform (Cloud API)
- Outbound: `sendWhatsAppTemplate()` posts template messages to
  `https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`. Every attempt is logged in
  `outbound_messages` with its status and error.
- Triggers: when a merchant enables WhatsApp and selects events, customers get `order.placed`, `order.accepted`,
  `delivery.picked_up` and `delivery.delivered` updates. Template names live in `WA_TEMPLATES`
  (`qabnah_order_placed`, `qabnah_order_accepted`, `qabnah_order_on_the_way`, `qabnah_order_delivered`,
  `qabnah_payment_link`). **They must be created and approved in WhatsApp Manager**, with body parameters
  `{{1}}` = store name and `{{2}}` = order number.
- Inbound: `GET /v1/webhooks/whatsapp` answers Meta's verification challenge (`WHATSAPP_VERIFY_TOKEN`).
  `POST /v1/webhooks/whatsapp` checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`),
  stores messages in `inbound_messages` (matched to the merchant by business number), and updates delivery/read
  statuses of outbound messages.
- Without Cloud API access, merchants still get `wa.me` share links for payment links and storefronts.
- **Not done:** Meta Business verification, phone number registration, template approval, live sends, the
  per-merchant multi-number (embedded signup) model. The current design is one platform number that sends on
  behalf of merchants. Whether merchants need their own numbers is a product decision.

## 4. Push notifications
- Devices register with `POST /v1/me/devices` and unregister on sign-out with `POST /v1/me/devices/unregister`.
  Every notification also goes to the in-app inbox and the WebSocket (`user:me` → `notification.created`).
- `PUSH_PROVIDER=live` sends one message per device:
  - **Android → FCM HTTP v1.** `FCM_SERVICE_ACCOUNT_JSON_B64` holds the base64 service-account JSON. The server mints
    RS256 JWT-bearer OAuth tokens (cached about 1 h) and sends to `projects/{id}/messages:send` with Android channel
    `offers` for captain offers, `support` for support updates, and `orders` for everything else.
  - **iOS → APNs over HTTP/2.** Uses `APNS_KEY_P8_B64`, `APNS_KEY_ID` and `APNS_TEAM_ID`. It builds an ES256 provider
    token (refreshed every 50 min). The topic is `APNS_BUNDLE_ID_CONSUMER` or `APNS_BUNDLE_ID_CAPTAIN`, depending on
    the device's app. Set `APNS_PRODUCTION=true` for App Store builds. Offers are sent with time-sensitive interruption.
  - Tokens reported invalid (FCM `UNREGISTERED`/404, APNs 410/`BadDeviceToken`) are deleted.
  - Each attempt is logged in `outbound_messages` (channel `push`).
- Payload data is `{type, orderId?, deliveryId?, offerId?, ticketId?, number?}`, with deep links `qabnah://…` (see API_CONTRACT).
- **To go live:**
  1. Create the Firebase project and the APNs key.
  2. Add the Firebase options to the Android build (`FCM_*` Gradle properties).
  3. Enable Push Notifications on both iOS bundle ids.
  4. Send a test to a real device.

  None of this has been done yet.

## 5. Realtime
- WebSocket `GET /v1/realtime?token=…`, fanned out through PostgreSQL `LISTEN/NOTIFY` (see ARCHITECTURE §4.7).
  No external service is involved. Clients fall back to polling.

## 6. Maps, geocoding and routing
- Locations are pins (lat/lng) plus landmark text. There is no geocoding provider yet, because Muscat addresses
  are pin-first (research §2).
- `ROUTING_PROVIDER=haversine` (default): straight-line distance × road factor (1.35 car, 1.5 bike).
- `ROUTING_PROVIDER=osrm` + `OSRM_URL`: real road distance and duration from OSRM, used for fees and quotes.
  - Timeout is 800 ms; on timeout or error it falls back to haversine, so quoting never fails because routing is down.
  - Bikes keep the haversine bike distance as a floor, because of the reported main-road restriction for delivery
    motorcycles.
  - Build the Oman data with `infra/osrm/prepare.sh` (Geofabrik GCC extract clipped to Oman), then start the `osrm`
    profile of the production compose file.
- Live ETA updates on every location ping deliberately stay on the cheap haversine estimate.
- Service-zone polygons in the seed are **approximate boxes** and must be redrawn by ops (Admin → Zones).

## 7. File storage
- `LocalStorage` writes to `STORAGE_DIR` (Docker volume `storage`). Private files (ID documents, proofs) are served
  only to the owner and reviewers, or through HMAC-signed URLs that expire after 5 minutes. Images are
  content-sniffed (magic bytes), 10 MB max.
- `STORAGE_DRIVER=s3` stores objects in a **private** bucket: `S3_BUCKET`, `S3_REGION`, keys, and `S3_ENDPOINT` for
  non-AWS providers. Files are still served only through the API's permission checks or signed URLs; with AWS the
  server sets SSE-S3 encryption. Choose the bucket region per DECISIONS D-012.
- Still to do: antivirus scanning of uploads, and image resizing/thumbnails.
