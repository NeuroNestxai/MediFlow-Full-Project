# Qabnah — Database Schema

PostgreSQL 16 + PostGIS 3.4. Migrations live in `backend/migrations/NNN_name.sql` and are applied in
order by `npm run migrate` (tracked in `schema_migrations`). This document explains the model; the SQL
is authoritative.

## Conventions
- Primary keys: `uuid` (`gen_random_uuid()`); high-volume append-only tables use `bigserial`.
- **Money: `int` baisa** (1 OMR = 1000 baisa), column suffix `_baisa`. Max int ≈ 2.1 M OMR per value —
  sufficient per row; aggregates are computed as `bigint`.
- **Rates: basis points** (`_bps`, 500 = 5 %).
- Enumerations are `text` + `CHECK` (cheaper to evolve than PG enums).
- Locations: `geography(Point,4326)`; areas: `geography(Polygon,4326)`; GiST indexes on all of them.
  API exchanges `{lat, lng}`; SQL uses `ST_MakePoint(lng, lat)` (note order).
- Timestamps: `timestamptz`, stored UTC; Oman is UTC+4 with no DST — clients localise.
- Bilingual content: `name_en` / `name_ar` pairs.

## Entity overview

```
users ─┬─< user_roles >── roles ──< role_permissions >── permissions
       ├─< refresh_tokens, otp_codes(by phone), addresses, notifications, device_tokens
       ├── captains ─┬─< captain_documents ── files
       │             ├─< captain_zones >── zones ──< pricing_rules, dispatch_rules(1:1, NULL=global)
       │             ├─< captain_availability
       │             └── captain_locations (latest position, 1:1)
       └─(merchant staff via user_roles.merchant_id)
merchants ─┬─< categories ──< products ──< product_option_groups ──< product_options
           ├─< storefront_banners, merchant_documents, merchant_subscriptions >── subscription_plans
           └─< payment_links
orders ─┬─< order_items, order_status_history, ratings, payments ──< refunds
        └── deliveries (1:1) ─┬─< delivery_offers >── captains
                              ├─< delivery_events, delivery_tracks
                              └── proofs_of_delivery (1:1)
ledger_entries >── settlements      (account = merchant | captain | platform)
support_tickets ──< support_messages
outbound_messages / inbound_messages (SMS, WhatsApp, push log)
payment_webhook_events (idempotent provider callbacks)
realtime_events (outbox, NOTIFY payload reference)
audit_logs, platform_settings
```

## Tables

### Identity & access
| Table | Purpose / key columns |
|---|---|
| `users` | One row per person. `phone` (E.164, unique, consumers/captains), `email` (citext, unique, staff), `password_hash` (bcrypt, staff only), `locale` ar/en, `status` active/suspended/deleted. |
| `permissions` | `key` (`orders:read`), description. |
| `roles` | `key`, `scope` platform/merchant/self. |
| `role_permissions` | M:N roles ↔ permissions. |
| `user_roles` | Assignment; `merchant_id` set for merchant-scoped roles. Unique on (user, role, merchant). |
| `refresh_tokens` | SHA-256 of opaque token, `family_id` for rotation + reuse detection, `revoked_at`, `replaced_by`. |
| `otp_codes` | Hashed 6-digit codes, `attempts`, `expires_at`, `consumed_at`. |
| `audit_logs` | Actor, action, entity, JSON data, IP. Append-only. |

### Geography & configuration
| Table | Purpose |
|---|---|
| `zones` | Service areas (polygons) e.g. `MCT-KHUWAIR`. A point is in a zone if `ST_Covers(boundary, point)`. |
| `pricing_rules` | Delivery fee rules. Matching: active rules filtered by zone (or NULL), delivery type (or NULL), vehicle (or NULL); most specific then highest `priority` wins. Fee = `max(min_fee, base + per_km × max(0, km − included_km)) × surge`, capped by `max_fee`. `captain_share_bps` = captain's share of the fee. |
| `dispatch_rules` | Per-zone dispatch config (NULL zone = global default): strategy, radius growth, timeouts, scoring weights. |
| `platform_settings` | Key/value JSON: `vat_rate_bps`, `service_fee_baisa`, `cod_max_baisa`, `default_commission_bps`, `order_auto_cancel_minutes`, … |

### Merchants & catalog
| Table | Purpose |
|---|---|
| `subscription_plans` | Plan code, monthly fee, `commission_bps`, feature flags. |
| `merchants` | Store profile, legal identifiers (`cr_number`, `vat_number` — collected, not validated automatically), status workflow `pending_review → active ⇄ suspended`, `rejected`. Branding (`logo_url`, `cover_url`, `brand_color`, `accent_color`, taglines), operating settings (prep time, min order, COD/online flags, `opening_hours` JSON `[{weekday, open, close}]`), WhatsApp settings. `location` + `zone_id`. |
| `merchant_subscriptions` | Plan history per merchant. |
| `merchant_documents` | KYB uploads (CR certificate, VAT certificate, municipality licence, owner ID, bank letter) with review status. |
| `storefront_banners` | Ordered banners shown on the branded storefront. |
| `categories` | Per-merchant menu/catalog categories. |
| `products` | Base price, compare-at price, availability, optional stock tracking. |
| `product_option_groups` | `kind = variant` (e.g. Size, `min=max=1`) or `addon` (e.g. Extras, `min 0 max 3`). |
| `product_options` | Option with `price_delta_baisa`. Unit price = base + Σ selected deltas; validated server-side against min/max. |
| `payment_links` | Merchant-created links (`code`) for a fixed amount; optional `request_delivery` to collect a dropoff pin and auto-book a courier after payment. |

### Consumers
| Table | Purpose |
|---|---|
| `addresses` | Pin-first addresses (Muscat has limited standardised street addressing): `location` is mandatory; area/street/building/floor/apartment/landmark are free text. |

### Captains
| Table | Purpose |
|---|---|
| `captains` | Onboarding status `pending_documents → pending_review → active ⇄ suspended`, `rejected`; vehicle; online flag; `max_concurrent`; rating; acceptance stats; payout bank details (IBAN). |
| `captain_documents` | National ID / resident card, driving licence, vehicle registration (mulkiya), insurance, profile photo, police clearance; each reviewed individually. |
| `captain_zones` | Zones the captain serves. |
| `captain_availability` | Weekly schedule slots (weekday 0 = Sunday, local time). |
| `captain_locations` | Latest location (one row per captain, upserted), used by dispatch. |

### Orders & deliveries
| Table | Purpose |
|---|---|
| `orders` | Commerce record for all three types. Human number `QB100001`. Money breakdown: `subtotal + delivery_fee + service_fee − discount (+ vat if prices exclude VAT) = total`; `cod_amount_baisa` = cash the captain must collect; `commission_baisa` = platform commission on merchant sales. `idempotency_key` unique per creator. |
| `order_items` | Snapshot of name, unit price and selected options (JSON) at order time. |
| `order_status_history` | Every status transition with actor. |
| `deliveries` | Logistics job (1:1 with order). Pickup/dropoff snapshot, package info (C2C), distance/ETA, `fee_baisa`, `captain_earning_baisa`, `cod_amount_baisa`, 4-digit `delivery_pin` shown to recipient, dispatch round/radius, milestone timestamps. |
| `delivery_offers` | Offers to captains with `expires_at`; at most one `accepted`. |
| `delivery_events` | Audit trail of delivery transitions with location. |
| `delivery_tracks` | Breadcrumbs while on a job (retention: 90 days — see DECISIONS D-012). |
| `proofs_of_delivery` | Photo file, recipient name, PIN verified flag, COD collected, location. |
| `ratings` | One rating per (order, target type). Updates rolling averages on captains/merchants. |

### Payments & finance
| Table | Purpose |
|---|---|
| `payments` | One row per checkout attempt (`mock`/`thawani`). `provider_ref` = gateway session id (unique). COD orders have no payment row. |
| `payment_webhook_events` | Raw callbacks, unique `(provider, event_key)` for idempotency. |
| `refunds` | Refund requests against a payment. |
| `ledger_entries` | Append-only signed ledger. Sign convention: **positive = platform owes the account, negative = account owes the platform.** |
| `settlements` | Period batches per account: credits, debits, net; draft → approved → paid. Entries reference their settlement once included. |

#### Ledger postings (on delivery completion)
| Scenario | Merchant | Captain | Platform |
|---|---|---|---|
| Marketplace, online paid, subtotal S, commission C, delivery fee F, captain earning E | `order_sale +S`, `commission −C` | `captain_earning +E` | `platform_commission_revenue +C`, `platform_delivery_revenue +(F−E)`, `platform_service_fee` |
| Marketplace, COD total T | `order_sale +S`, `commission −C` | `captain_earning +E`, `cod_collected −T` | as above |
| Merchant delivery, prepaid externally | `delivery_fee_charge −F` | `captain_earning +E` | `platform_delivery_revenue +(F−E)` |
| Merchant delivery with COD amount A | `order_sale +A`, `delivery_fee_charge −F` | `captain_earning +E`, `cod_collected −A` | as above |
| C2C, online | — | `captain_earning +E` | `platform_delivery_revenue +(F−E)` |
| C2C, COD (sender or recipient pays F) | — | `captain_earning +E`, `cod_collected −F` | as above |

When the captain remits cash at a hub: `cod_remitted +amount` on the captain account.

### Messaging, support, realtime
| Table | Purpose |
|---|---|
| `notifications` | In-app inbox per user. |
| `device_tokens` | Push tokens per app/platform. |
| `outbound_messages` | Every SMS/WhatsApp/push sent (provider, template, status updates from webhooks). |
| `inbound_messages` | WhatsApp inbound messages (webhook). |
| `support_tickets`, `support_messages` | Ticketing with internal notes. |
| `realtime_events` | Outbox; id is sent via `NOTIFY qabnah_events` and fanned out by every API instance. Pruned after 24 h. |

## Indexing highlights
- GiST: `zones.boundary`, `merchants.location`, `captain_locations.location`, `deliveries.pickup_location`.
- Partial: `delivery_offers (status, expires_at) WHERE status='pending'` for the expiry worker;
  `ledger_entries WHERE settlement_id IS NULL` for settlement generation.
- `orders (merchant_id, status, created_at DESC)` for the merchant live board.

## Data retention (proposed — must be validated against Oman PDPL, see research doc)
| Data | Retention |
|---|---|
| Delivery breadcrumbs (`delivery_tracks`) | 90 days |
| Captain latest location | overwritten; cleared when offline > 24 h |
| OTP codes | 24 h |
| Identity documents of rejected applicants | 180 days then deleted |
| Orders, payments, ledger, invoices | per tax-record retention requirements (to confirm with Oman Tax Authority guidance) |
