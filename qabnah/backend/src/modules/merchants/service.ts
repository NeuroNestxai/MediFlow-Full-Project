import { config } from '../../config.js';
import { one, q, type Queryable } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { latLngCols, rowPoint } from '../../lib/geo.js';
import { getSettings } from '../core/settings.js';
import { isWithinOpeningHours } from '../core/time.js';

export const MERCHANT_SELECT = `SELECT m.*, ${latLngCols('m.location', 'loc')}, p.commission_bps AS plan_commission_bps,
  p.code AS plan_code, p.name_en AS plan_name_en, p.name_ar AS plan_name_ar, p.monthly_fee_baisa AS plan_fee, p.features AS plan_features, p.is_active AS plan_active
  FROM merchants m LEFT JOIN subscription_plans p ON p.id = m.plan_id`;

export const storefrontUrl = (slug: string) => `${config.MERCHANT_WEB_URL}/s/${slug}`;

export function merchantIsOpen(m: any, now = new Date()) {
  return m.status === 'active' && m.is_open && isWithinOpeningHours(m.opening_hours ?? [], now);
}

export function merchantSummaryDto(m: any) {
  return {
    id: m.id,
    slug: m.slug,
    nameEn: m.name_en,
    nameAr: m.name_ar,
    category: m.category,
    logoUrl: m.logo_url,
    coverUrl: m.cover_url,
    brandColor: m.brand_color,
    accentColor: m.accent_color,
    taglineEn: m.tagline_en,
    taglineAr: m.tagline_ar,
    ratingAvg: Number(m.rating_avg),
    ratingCount: m.rating_count,
    isOpen: merchantIsOpen(m),
    prepTimeMinutes: m.prep_time_minutes,
    minOrderBaisa: m.min_order_baisa,
    acceptsCod: m.accepts_cod,
    acceptsOnline: m.accepts_online,
    distanceM: m.distance_m != null ? Math.round(Number(m.distance_m)) : null,
    location: rowPoint(m, 'loc'),
  };
}

export function effectiveCommissionBps(m: any, defaultBps: number): number {
  return m.commission_bps_override ?? m.plan_commission_bps ?? defaultBps;
}

export async function merchantDetailDto(db: Queryable, m: any) {
  const settings = await getSettings(db);
  return {
    ...merchantSummaryDto(m),
    status: m.status,
    rejectionReason: m.rejection_reason,
    legalName: m.legal_name,
    crNumber: m.cr_number,
    vatNumber: m.vat_number,
    contactPhone: m.contact_phone,
    contactEmail: m.contact_email,
    whatsappPhone: m.whatsapp_phone,
    whatsappEnabled: m.whatsapp_enabled,
    whatsappNotifyEvents: m.whatsapp_notify_events,
    addressText: m.address_text,
    zoneId: m.zone_id,
    pricesIncludeVat: m.prices_include_vat,
    openingHours: m.opening_hours,
    storeToggleOpen: m.is_open,
    commissionBps: effectiveCommissionBps(m, settings.defaultCommissionBps),
    commissionBpsOverride: m.commission_bps_override,
    plan: m.plan_id
      ? { id: m.plan_id, code: m.plan_code, nameEn: m.plan_name_en, nameAr: m.plan_name_ar, monthlyFeeBaisa: m.plan_fee, commissionBps: m.plan_commission_bps, features: m.plan_features, isActive: m.plan_active }
      : null,
    storefrontUrl: storefrontUrl(m.slug),
    createdAt: m.created_at,
    approvedAt: m.approved_at,
  };
}

export async function getMerchant(db: Queryable, id: string) {
  const m = await one(db, `${MERCHANT_SELECT} WHERE m.id = $1`, [id]);
  if (!m) throw notFound('Merchant');
  return m;
}

/** Users holding a merchant permission (for notifications). */
export async function merchantUserIds(db: Queryable, merchantId: string, perm = 'merchant.orders:read'): Promise<string[]> {
  const rows = await q(
    db,
    `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.merchant_id = $1 AND rp.permission_key = $2`,
    [merchantId, perm],
  );
  return rows.map((r) => r.user_id);
}
