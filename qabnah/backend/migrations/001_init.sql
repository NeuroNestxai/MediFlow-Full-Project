-- Qabnah initial schema. Money = integer baisa (1 OMR = 1000 baisa). Rates = basis points.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────── Identity & access ─────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text UNIQUE,
  email         citext UNIQUE,
  password_hash text,
  full_name     text NOT NULL DEFAULT '',
  locale        text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE permissions (
  key         text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('platform','merchant','self')),
  is_system   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id        uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  merchant_id uuid,  -- FK added after merchants table
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX user_roles_unique ON user_roles (user_id, role_id, COALESCE(merchant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  purpose     text NOT NULL DEFAULT 'login',
  code_hash   text NOT NULL,
  attempts    int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone ON otp_codes (phone, created_at DESC);

CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  data          jsonb NOT NULL DEFAULT '{}',
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created ON audit_logs (created_at DESC);

-- ───────────────────────── Files ─────────────────────────
CREATE TABLE files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id),
  purpose       text NOT NULL CHECK (purpose IN ('captain_document','merchant_document','product_image','branding','proof_of_delivery','support_attachment','other')),
  visibility    text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  storage_key   text NOT NULL UNIQUE,
  mime_type     text NOT NULL,
  size_bytes    int  NOT NULL,
  sha256        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Geography, pricing, dispatch config ─────────────────────────
CREATE TABLE zones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name_en    text NOT NULL,
  name_ar    text NOT NULL,
  boundary   geography(Polygon,4326) NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zones_boundary_gix ON zones USING gist (boundary);

CREATE TABLE pricing_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  zone_id           uuid REFERENCES zones(id) ON DELETE CASCADE,         -- NULL = all zones
  delivery_type     text CHECK (delivery_type IN ('marketplace','merchant_delivery','c2c')), -- NULL = all
  vehicle_type      text CHECK (vehicle_type IN ('bike','car','van')),   -- NULL = all
  base_fee_baisa    int  NOT NULL CHECK (base_fee_baisa >= 0),
  per_km_baisa      int  NOT NULL CHECK (per_km_baisa >= 0),
  included_km       numeric(6,2) NOT NULL DEFAULT 0,
  min_fee_baisa     int  NOT NULL DEFAULT 0,
  max_fee_baisa     int,
  max_distance_km   numeric(6,2) NOT NULL DEFAULT 40,
  surge_multiplier  numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1),
  captain_share_bps int  NOT NULL DEFAULT 8000 CHECK (captain_share_bps BETWEEN 0 AND 10000),
  priority          int  NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dispatch_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id                uuid UNIQUE REFERENCES zones(id) ON DELETE CASCADE, -- NULL = global default
  strategy               text NOT NULL DEFAULT 'sequential' CHECK (strategy IN ('sequential','broadcast','manual')),
  auto_dispatch          boolean NOT NULL DEFAULT true,
  dispatch_on_accept     boolean NOT NULL DEFAULT true,
  search_radius_km       numeric(5,2) NOT NULL DEFAULT 3,
  radius_step_km         numeric(5,2) NOT NULL DEFAULT 2,
  max_radius_km          numeric(5,2) NOT NULL DEFAULT 10,
  max_rounds             int NOT NULL DEFAULT 6,
  broadcast_size         int NOT NULL DEFAULT 3,
  offer_timeout_s        int NOT NULL DEFAULT 30 CHECK (offer_timeout_s BETWEEN 5 AND 600),
  location_max_age_s     int NOT NULL DEFAULT 120,
  respect_schedule       boolean NOT NULL DEFAULT false,
  -- windows when bike captains get no offers, local Muscat time, e.g. [{"months":[6,7,8],"start":"12:30","end":"15:30"}]
  bike_blackout          jsonb NOT NULL DEFAULT '[{"months":[6,7,8],"start":"12:30","end":"15:30"}]',
  weight_distance        numeric(4,2) NOT NULL DEFAULT 0.6,
  weight_rating          numeric(4,2) NOT NULL DEFAULT 0.2,
  weight_acceptance      numeric(4,2) NOT NULL DEFAULT 0.2,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dispatch_rules_one_global ON dispatch_rules ((zone_id IS NULL)) WHERE zone_id IS NULL;

CREATE TABLE platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

-- ───────────────────────── Merchants & catalog ─────────────────────────
CREATE TABLE subscription_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  monthly_fee_baisa int  NOT NULL DEFAULT 0,
  commission_bps    int  NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  features          jsonb NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merchants (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name_en                 text NOT NULL,
  name_ar                 text NOT NULL,
  legal_name              text,
  cr_number               text,
  vat_number              text,
  category                text NOT NULL DEFAULT 'other' CHECK (category IN ('restaurant','cafe','grocery','pharmacy','retail','flowers','electronics','other')),
  status                  text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','active','suspended','rejected')),
  rejection_reason        text,
  contact_phone           text,
  contact_email           citext,
  whatsapp_phone          text,
  location                geography(Point,4326) NOT NULL,
  address_text            text NOT NULL DEFAULT '',
  zone_id                 uuid REFERENCES zones(id),
  plan_id                 uuid REFERENCES subscription_plans(id),
  commission_bps_override int CHECK (commission_bps_override BETWEEN 0 AND 10000),
  prices_include_vat      boolean NOT NULL DEFAULT true,
  prep_time_minutes       int NOT NULL DEFAULT 20,
  min_order_baisa         int NOT NULL DEFAULT 0,
  accepts_cod             boolean NOT NULL DEFAULT true,
  accepts_online          boolean NOT NULL DEFAULT true,
  is_open                 boolean NOT NULL DEFAULT true,
  opening_hours           jsonb NOT NULL DEFAULT '[]',
  -- branding
  logo_url                text,
  cover_url               text,
  brand_color             text NOT NULL DEFAULT '#0F766E' CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color            text NOT NULL DEFAULT '#F59E0B' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  tagline_en              text,
  tagline_ar              text,
  -- whatsapp settings
  whatsapp_enabled        boolean NOT NULL DEFAULT false,
  whatsapp_notify_events  text[] NOT NULL DEFAULT ARRAY['order.placed','order.accepted','delivery.picked_up','delivery.delivered'],
  rating_avg              numeric(3,2) NOT NULL DEFAULT 0,
  rating_count            int NOT NULL DEFAULT 0,
  approved_at             timestamptz,
  approved_by             uuid REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchants_location_gix ON merchants USING gist (location);
CREATE INDEX merchants_status ON merchants (status);

ALTER TABLE user_roles ADD CONSTRAINT user_roles_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;

CREATE TABLE merchant_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id            uuid NOT NULL REFERENCES subscription_plans(id),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  cancelled_at       timestamptz
);
CREATE INDEX merchant_subscriptions_merchant ON merchant_subscriptions (merchant_id);

CREATE TABLE merchant_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN ('commercial_registration','vat_certificate','municipality_license','owner_id','bank_letter','other')),
  file_id          uuid NOT NULL REFERENCES files(id),
  number           text,
  expires_at       date,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by      uuid REFERENCES users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storefront_banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  image_url   text NOT NULL,
  title_en    text,
  title_ar    text,
  link_url    text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_merchant ON categories (merchant_id);

CREATE TABLE products (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id            uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  category_id            uuid REFERENCES categories(id) ON DELETE SET NULL,
  name_en                text NOT NULL,
  name_ar                text NOT NULL,
  description_en         text,
  description_ar         text,
  image_url              text,
  sku                    text,
  base_price_baisa       int NOT NULL CHECK (base_price_baisa >= 0),
  compare_at_price_baisa int CHECK (compare_at_price_baisa >= 0),
  is_available           boolean NOT NULL DEFAULT true,
  track_stock            boolean NOT NULL DEFAULT false,
  stock_qty              int NOT NULL DEFAULT 0,
  sort_order             int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_merchant ON products (merchant_id, category_id);

-- Option groups cover both variants (e.g. Size: exactly one) and add-ons (e.g. Extras: 0..3).
CREATE TABLE product_option_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('variant','addon')),
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  min_select  int NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select  int NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  sort_order  int NOT NULL DEFAULT 0,
  CHECK (max_select >= min_select)
);
CREATE INDEX product_option_groups_product ON product_option_groups (product_id);

CREATE TABLE product_options (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE,
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  price_delta_baisa int NOT NULL DEFAULT 0,
  is_available      boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0
);
CREATE INDEX product_options_group ON product_options (group_id);

-- ───────────────────────── Consumers ─────────────────────────
CREATE TABLE addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         text NOT NULL DEFAULT 'home',
  location      geography(Point,4326) NOT NULL,
  area          text,
  street        text,
  building      text,
  floor         text,
  apartment     text,
  landmark      text,
  contact_name  text,
  contact_phone text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user ON addresses (user_id);

-- ───────────────────────── Captains ─────────────────────────
-- Licensed delivery companies that employ riders (see DECISIONS D-013).
CREATE TABLE fleet_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  cr_number       text,
  licence_number  text,
  licence_expires_at date,
  contact_name    text,
  contact_phone   text,
  contact_email   citext,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE captains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending_documents' CHECK (status IN ('pending_documents','pending_review','active','suspended','rejected')),
  rejection_reason   text,
  employment_model   text NOT NULL DEFAULT 'independent' CHECK (employment_model IN ('independent','fleet')),
  fleet_partner_id   uuid REFERENCES fleet_partners(id),
  national_id_number text,
  nationality        text,
  date_of_birth      date,
  vehicle_type       text NOT NULL CHECK (vehicle_type IN ('bike','car','van')),
  vehicle_make       text,
  vehicle_model      text,
  vehicle_plate      text,
  vehicle_color      text,
  is_online          boolean NOT NULL DEFAULT false,
  max_concurrent     int NOT NULL DEFAULT 1 CHECK (max_concurrent BETWEEN 1 AND 5),
  rating_avg         numeric(3,2) NOT NULL DEFAULT 5,
  rating_count       int NOT NULL DEFAULT 0,
  offers_received    int NOT NULL DEFAULT 0,
  offers_accepted    int NOT NULL DEFAULT 0,
  bank_name          text,
  iban               text,
  approved_at        timestamptz,
  approved_by        uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captains_status ON captains (status, is_online);

CREATE TABLE captain_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id       uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN ('national_id','driving_license','vehicle_registration','vehicle_insurance','profile_photo','police_clearance','professional_license','preventive_driving_license','naql_registration')),
  file_id          uuid NOT NULL REFERENCES files(id),
  number           text,
  expires_at       date,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by      uuid REFERENCES users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captain_documents_captain ON captain_documents (captain_id);

CREATE TABLE captain_zones (
  captain_id uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  zone_id    uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (captain_id, zone_id)
);

CREATE TABLE captain_availability (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  weekday    int  NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  start_time time NOT NULL,
  end_time   time NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX captain_availability_captain ON captain_availability (captain_id);

CREATE TABLE captain_locations (
  captain_id  uuid PRIMARY KEY REFERENCES captains(id) ON DELETE CASCADE,
  location    geography(Point,4326) NOT NULL,
  heading     numeric(5,1),
  speed_mps   numeric(6,2),
  accuracy_m  numeric(7,1),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captain_locations_gix ON captain_locations USING gist (location);

-- ───────────────────────── Payment links (needs merchants) ─────────────────────────
CREATE TABLE payment_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code             text NOT NULL UNIQUE,
  title            text NOT NULL,
  description      text,
  amount_baisa     int NOT NULL CHECK (amount_baisa > 0),
  currency         text NOT NULL DEFAULT 'OMR',
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','expired','cancelled')),
  customer_name    text,
  customer_phone   text,
  request_delivery boolean NOT NULL DEFAULT false,
  expires_at       timestamptz,
  paid_at          timestamptz,
  order_id         uuid,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_links_merchant ON payment_links (merchant_id, created_at DESC);

-- ───────────────────────── Orders ─────────────────────────
CREATE SEQUENCE order_number_seq START 100001;

CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number             text NOT NULL UNIQUE DEFAULT ('QB' || nextval('order_number_seq')::text),
  type               text NOT NULL CHECK (type IN ('marketplace','merchant_delivery','c2c')),
  source             text NOT NULL DEFAULT 'app' CHECK (source IN ('app','storefront','portal','payment_link','whatsapp','admin')),
  merchant_id        uuid REFERENCES merchants(id),
  customer_user_id   uuid REFERENCES users(id),
  customer_name      text,
  customer_phone     text,
  status             text NOT NULL CHECK (status IN ('pending_payment','placed','accepted','preparing','ready_for_pickup','out_for_delivery','delivered','completed','rejected','cancelled')),
  payment_method     text NOT NULL CHECK (payment_method IN ('online','cod','prepaid')),
  payment_status     text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','failed','refunded','partially_refunded')),
  cod_payer          text CHECK (cod_payer IN ('sender','recipient')),
  subtotal_baisa     int NOT NULL DEFAULT 0,
  delivery_fee_baisa int NOT NULL DEFAULT 0,
  service_fee_baisa  int NOT NULL DEFAULT 0,
  discount_baisa     int NOT NULL DEFAULT 0,
  vat_baisa          int NOT NULL DEFAULT 0,
  total_baisa        int NOT NULL DEFAULT 0,
  cod_amount_baisa   int NOT NULL DEFAULT 0,
  commission_baisa   int NOT NULL DEFAULT 0,
  currency           text NOT NULL DEFAULT 'OMR',
  notes              text,
  prep_time_minutes  int,
  idempotency_key    text,
  placed_at          timestamptz,
  accepted_at        timestamptz,
  ready_at           timestamptz,
  delivered_at       timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  cancelled_by       uuid REFERENCES users(id),
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (type = 'c2c' OR merchant_id IS NOT NULL)
);
CREATE UNIQUE INDEX orders_idempotency ON orders (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX orders_customer ON orders (customer_user_id, created_at DESC);
CREATE INDEX orders_merchant ON orders (merchant_id, status, created_at DESC);
CREATE INDEX orders_status ON orders (status, created_at DESC);

ALTER TABLE payment_links ADD CONSTRAINT payment_links_order_fk FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES products(id) ON DELETE SET NULL,
  name_en          text NOT NULL,
  name_ar          text NOT NULL,
  unit_price_baisa int NOT NULL,
  quantity         int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  options          jsonb NOT NULL DEFAULT '[]',
  line_total_baisa int NOT NULL,
  notes            text
);
CREATE INDEX order_items_order ON order_items (order_id);

CREATE TABLE order_status_history (
  id            bigserial PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status   text,
  to_status     text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order ON order_status_history (order_id, created_at);

-- ───────────────────────── Deliveries ─────────────────────────
CREATE TABLE deliveries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'created' CHECK (status IN ('created','searching','unassigned','assigned','at_pickup','picked_up','at_dropoff','delivered','failed','returning','returned','cancelled')),
  vehicle_type            text CHECK (vehicle_type IN ('bike','car','van')), -- NULL = any
  captain_id              uuid REFERENCES captains(id),
  zone_id                 uuid REFERENCES zones(id),
  pickup_location         geography(Point,4326) NOT NULL,
  pickup_address          text NOT NULL DEFAULT '',
  pickup_contact_name     text,
  pickup_contact_phone    text,
  pickup_notes            text,
  dropoff_location        geography(Point,4326) NOT NULL,
  dropoff_address         text NOT NULL DEFAULT '',
  dropoff_contact_name    text,
  dropoff_contact_phone   text,
  dropoff_notes           text,
  package_size            text CHECK (package_size IN ('small','medium','large')),
  package_description     text,
  declared_value_baisa    int,
  distance_m              int NOT NULL DEFAULT 0,
  estimated_duration_s    int NOT NULL DEFAULT 0,
  fee_baisa               int NOT NULL DEFAULT 0,
  captain_earning_baisa   int NOT NULL DEFAULT 0,
  cod_amount_baisa        int NOT NULL DEFAULT 0,
  delivery_pin            text NOT NULL,
  pin_required            boolean NOT NULL DEFAULT true,
  dispatch_round          int NOT NULL DEFAULT 0,
  current_radius_km       numeric(5,2),
  eta_pickup_at           timestamptz,
  eta_dropoff_at          timestamptz,
  assigned_at             timestamptz,
  at_pickup_at            timestamptz,
  picked_up_at            timestamptz,
  at_dropoff_at           timestamptz,
  delivered_at            timestamptz,
  failed_at               timestamptz,
  failure_reason          text,
  cancelled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_status ON deliveries (status);
CREATE INDEX deliveries_captain ON deliveries (captain_id, status);
CREATE INDEX deliveries_pickup_gix ON deliveries USING gist (pickup_location);

CREATE TABLE delivery_offers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  captain_id            uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  round                 int NOT NULL DEFAULT 1,
  score                 numeric(6,4),
  distance_to_pickup_m  int,
  earning_baisa         int NOT NULL DEFAULT 0,
  offered_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  responded_at          timestamptz,
  reject_reason         text
);
CREATE INDEX delivery_offers_pending ON delivery_offers (status, expires_at) WHERE status = 'pending';
CREATE INDEX delivery_offers_captain ON delivery_offers (captain_id, status);
CREATE INDEX delivery_offers_delivery ON delivery_offers (delivery_id);

CREATE TABLE delivery_events (
  id            bigserial PRIMARY KEY,
  delivery_id   uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  type          text NOT NULL,
  from_status   text,
  to_status     text,
  actor_user_id uuid REFERENCES users(id),
  location      geography(Point,4326),
  data          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_events_delivery ON delivery_events (delivery_id, created_at);

CREATE TABLE delivery_tracks (
  id          bigserial PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  captain_id  uuid NOT NULL REFERENCES captains(id),
  location    geography(Point,4326) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_tracks_delivery ON delivery_tracks (delivery_id, recorded_at);

CREATE TABLE proofs_of_delivery (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id    uuid NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE CASCADE,
  photo_file_id  uuid REFERENCES files(id),
  recipient_name text,
  pin_verified   boolean NOT NULL DEFAULT false,
  cod_collected_baisa int NOT NULL DEFAULT 0,
  note           text,
  location       geography(Point,4326),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rater_user_id uuid NOT NULL REFERENCES users(id),
  target_type   text NOT NULL CHECK (target_type IN ('captain','merchant')),
  target_id     uuid NOT NULL,
  score         int NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, target_type)
);

-- ───────────────────────── Payments & finance ─────────────────────────
CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid REFERENCES orders(id),
  payment_link_id  uuid REFERENCES payment_links(id),
  provider         text NOT NULL CHECK (provider IN ('mock','thawani')),
  provider_ref     text,
  status           text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','cancelled','expired','refunded','partially_refunded')),
  amount_baisa     int NOT NULL CHECK (amount_baisa > 0),
  refunded_baisa   int NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'OMR',
  checkout_url     text,
  raw              jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (order_id IS NOT NULL OR payment_link_id IS NOT NULL)
);
CREATE UNIQUE INDEX payments_provider_ref ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX payments_order ON payments (order_id);

CREATE TABLE payment_webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  event_key       text NOT NULL,
  payload         jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);

CREATE TABLE refunds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid NOT NULL REFERENCES payments(id),
  order_id     uuid NOT NULL REFERENCES orders(id),
  amount_baisa int NOT NULL CHECK (amount_baisa > 0),
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  provider_ref text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type   text NOT NULL CHECK (account_type IN ('merchant','captain')),
  account_id     uuid NOT NULL,
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  credits_baisa  int  NOT NULL DEFAULT 0,
  debits_baisa   int  NOT NULL DEFAULT 0,
  net_baisa      int  NOT NULL DEFAULT 0,
  entry_count    int  NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  payout_reference text,
  created_by     uuid REFERENCES users(id),
  approved_by    uuid REFERENCES users(id),
  approved_at    timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX settlements_account ON settlements (account_type, account_id, period_start);

-- Append-only signed ledger. Positive = platform owes the account; negative = account owes the platform.
CREATE TABLE ledger_entries (
  id            bigserial PRIMARY KEY,
  account_type  text NOT NULL CHECK (account_type IN ('merchant','captain','platform')),
  account_id    uuid,  -- NULL for platform
  entry_type    text NOT NULL CHECK (entry_type IN ('order_sale','commission','delivery_fee_charge','captain_earning','cod_collected','cod_remitted','online_collection','platform_delivery_revenue','platform_commission_revenue','platform_service_fee','refund','payout','subscription_fee','adjustment','tip')),
  amount_baisa  int  NOT NULL,
  order_id      uuid REFERENCES orders(id),
  delivery_id   uuid REFERENCES deliveries(id),
  settlement_id uuid REFERENCES settlements(id),
  description   text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_account ON ledger_entries (account_type, account_id, created_at);
CREATE INDEX ledger_unsettled ON ledger_entries (account_type, account_id) WHERE settlement_id IS NULL;
CREATE INDEX ledger_order ON ledger_entries (order_id);

-- ───────────────────────── Notifications & messaging ─────────────────────────
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE device_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('ios','android','web')),
  app        text NOT NULL CHECK (app IN ('consumer','captain','merchant','admin')),
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel             text NOT NULL CHECK (channel IN ('sms','whatsapp','push','email')),
  provider            text NOT NULL,
  merchant_id         uuid REFERENCES merchants(id) ON DELETE SET NULL,
  to_address          text NOT NULL,
  template            text,
  body                text,
  payload             jsonb NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_messages_merchant ON outbound_messages (merchant_id, created_at DESC);
CREATE INDEX outbound_messages_provider_id ON outbound_messages (provider_message_id);

CREATE TABLE inbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel             text NOT NULL DEFAULT 'whatsapp',
  from_address        text NOT NULL,
  to_address          text,
  body                text,
  provider_message_id text UNIQUE,
  payload             jsonb NOT NULL DEFAULT '{}',
  merchant_id         uuid REFERENCES merchants(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Support ─────────────────────────
CREATE SEQUENCE ticket_number_seq START 5001;
CREATE TABLE support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            text NOT NULL UNIQUE DEFAULT ('T' || nextval('ticket_number_seq')::text),
  requester_user_id uuid NOT NULL REFERENCES users(id),
  requester_role    text NOT NULL DEFAULT 'consumer' CHECK (requester_role IN ('consumer','captain','merchant')),
  order_id          uuid REFERENCES orders(id),
  merchant_id       uuid REFERENCES merchants(id),
  category          text NOT NULL CHECK (category IN ('order_issue','payment','delivery','captain','merchant','account','other')),
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  subject           text NOT NULL,
  assigned_to       uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_status ON support_tickets (status, priority, created_at);

CREATE TABLE support_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id),
  body           text NOT NULL,
  is_internal    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket ON support_messages (ticket_id, created_at);

-- ───────────────────────── Realtime outbox ─────────────────────────
CREATE TABLE realtime_events (
  id         bigserial PRIMARY KEY,
  channels   text[] NOT NULL,
  event      text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX realtime_events_created ON realtime_events (created_at);
