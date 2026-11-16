# Qabnah — User Roles and Permissions

Source of truth for RBAC. The SQL reference data in `backend/migrations/002_rbac.sql` is generated from
`backend/scripts/gen_rbac.py`; change the script, regenerate, and add a new migration — never edit
permissions by hand in production.

## 1. Actor types

| Actor | How they authenticate | Identity record | Notes |
|---|---|---|---|
| Consumer | Phone + SMS OTP | `users` | Every phone-verified user can order. Implicit role `consumer`. |
| Captain (independent courier) | Phone + SMS OTP | `users` + `captains` | Must register, upload documents and be approved (`captains.status = active`) before going online or receiving offers. Implicit role `captain`. |
| Merchant staff | Email + password | `users` + `user_roles(merchant_id)` | Roles are scoped to one merchant; a person may belong to several merchants with different roles. |
| Platform staff (admin) | Email + password | `users` + `user_roles(merchant_id NULL)` | One or more platform roles. MFA (TOTP) is a pre-launch requirement — see IMPLEMENTATION_PLAN M9. |
| External systems | Signed webhooks | — | Payment gateway, WhatsApp Cloud API. Verified by signature/secret, never by JWT. |

## 2. Authorization model

1. **Permission strings** `resource:action`. Merchant-scoped permissions are prefixed `merchant.`.
2. **Roles** bundle permissions and have a scope: `platform`, `merchant`, or `self` (implicit).
3. **Assignments** (`user_roles`) bind a user to a role; merchant roles carry `merchant_id`.
4. **Evaluation** (backend `lib/auth.ts`):
   - `requirePermission(p)` → user holds a *platform* role granting `p`.
   - `requireMerchantPermission(merchantId, p)` → user holds a merchant role for **that** merchant
     granting `p`, **or** a platform role granting `merchants:manage` (support access, audited).
   - Ownership checks (consumer owns order / address; captain is assigned to delivery) are performed
     inside services and are not expressible as permissions.
5. Permissions are loaded on every request from the database with a short in-process cache
   (30 s), so revocation is effective within 30 s even though JWTs live 15 min.
6. Every platform-staff mutation writes `audit_logs` (actor, action, entity, diff, IP).

## 3. Platform roles

| Role | Purpose |
|---|---|
| `super_admin` | Full platform access. Limited to founders/CTO; use break-glass procedure. |
| `ops_manager` | Runs live operations: dispatch, captains, zones, dispatch rules, support. |
| `dispatcher` | Live map, manual assignment and re-dispatch only. |
| `support_agent` | Tickets; read-only access to orders, deliveries, users. |
| `onboarding_reviewer` | KYC/KYB review of captains and merchants. |
| `finance` | Prepares settlements, records payouts, issues refunds, manages plans. |
| `finance_manager` | Approves settlements (four-eyes with `finance`), pricing and platform settings. |
| `analyst` | Read-only analytics and finance reporting. |

Separation of duties: `settlements:manage` (prepare / mark paid) and `settlements:approve` are in
different roles; the backend additionally rejects approval by the user who generated the batch.

## 4. Merchant roles

| Role | Purpose |
|---|---|
| `merchant_owner` | Everything for the store including staff and finance. Created on merchant sign-up. |
| `merchant_manager` | Everything except staff management. |
| `merchant_staff` | Order handling and booking deliveries (cashier / kitchen tablet). |

## 5. Permission matrix

| Permission | Scope | super_admin | ops_manager | dispatcher | support_agent | onboarding_reviewer | finance | finance_manager | analyst | merchant_owner | merchant_manager | merchant_staff |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `merchants:read` | platform | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  |
| `merchants:review` | platform | ✔ |  |  |  | ✔ |  |  |  |  |  |  |
| `merchants:manage` | platform | ✔ |  |  |  |  |  |  |  |  |  |  |
| `captains:read` | platform | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  |
| `captains:review` | platform | ✔ |  |  |  | ✔ |  |  |  |  |  |  |
| `captains:manage` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `orders:read` | platform | ✔ | ✔ | ✔ | ✔ |  | ✔ | ✔ | ✔ |  |  |  |
| `orders:manage` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `orders:refund` | platform | ✔ |  |  |  |  | ✔ |  |  |  |  |  |
| `deliveries:read` | platform | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |  |
| `deliveries:dispatch` | platform | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `deliveries:cancel` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `zones:manage` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `pricing:manage` | platform | ✔ |  |  |  |  |  | ✔ |  |  |  |  |
| `dispatch_rules:manage` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `settings:manage` | platform | ✔ |  |  |  |  |  | ✔ |  |  |  |  |
| `plans:manage` | platform | ✔ |  |  |  |  | ✔ |  |  |  |  |  |
| `support:read` | platform | ✔ | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `support:reply` | platform | ✔ | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `support:assign` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `analytics:read` | platform | ✔ | ✔ |  |  |  | ✔ | ✔ | ✔ |  |  |  |
| `finance:read` | platform | ✔ |  |  |  |  | ✔ | ✔ | ✔ |  |  |  |
| `settlements:manage` | platform | ✔ |  |  |  |  | ✔ |  |  |  |  |  |
| `settlements:approve` | platform | ✔ |  |  |  |  |  | ✔ |  |  |  |  |
| `users:read` | platform | ✔ | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `users:manage` | platform | ✔ |  |  |  |  |  |  |  |  |  |  |
| `staff:manage` | platform | ✔ |  |  |  |  |  |  |  |  |  |  |
| `audit:read` | platform | ✔ | ✔ |  |  |  |  |  |  |  |  |  |
| `merchant.store:read` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ | ✔ |
| `merchant.store:manage` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ |  |
| `merchant.catalog:write` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ |  |
| `merchant.orders:read` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ | ✔ |
| `merchant.orders:process` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ | ✔ |
| `merchant.deliveries:create` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ | ✔ |
| `merchant.payment_links:manage` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ |  |
| `merchant.finance:read` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ |  |
| `merchant.analytics:read` | merchant |  |  |  |  |  |  |  |  | ✔ | ✔ |  |
| `merchant.staff:manage` | merchant |  |  |  |  |  |  |  |  | ✔ |  |  |

## 6. Implicit (self) capabilities

| Capability | Consumer | Captain |
|---|---|---|
| Manage own profile, addresses, devices, notifications | ✔ | ✔ |
| Place marketplace orders, create C2C shipments, pay, cancel own order (before pickup) | ✔ | ✔ (as a consumer) |
| Track own orders (incl. captain location while the delivery is active) | ✔ | — |
| Rate captain and merchant on own completed order | ✔ | — |
| Register as captain, upload documents, set zones and availability | — | ✔ |
| Go online/offline, stream location (only when `active`) | — | ✔ |
| See and respond to own offers; see assigned deliveries; update status; submit proof of delivery | — | ✔ |
| See own earnings, COD cash balance and payouts | — | ✔ |
| Open support tickets about own orders/deliveries | ✔ | ✔ |

## 7. Data visibility rules (object level)

- A consumer sees only orders where `customer_user_id = me`. Captain identity shown to the consumer:
  first name, vehicle, plate, rating, live location — only between assignment and delivery.
- A captain sees pickup/dropoff details of a delivery only after accepting the offer; the offer
  itself shows approximate pickup area, distance, and earning. Dropoff contact phone is revealed
  only while the delivery is in progress and is hidden again after completion.
- Merchant staff see only their merchant's orders and customers' name/phone/address for those
  orders. They do not see the captain's phone after delivery completion.
- Identity documents (captain and merchant) are visible to their owner and to users with
  `captains:review` / `merchants:review`, via 5-minute signed URLs. Each view is audit-logged.
- Realtime channel subscriptions are authorized with the same rules (see ARCHITECTURE §4.7).
