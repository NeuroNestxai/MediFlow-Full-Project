import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { audit, invalidateAuthCache, requirePerm } from '../../lib/auth.js';
import { randomToken } from '../../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { latLngCols, rowPoint } from '../../lib/geo.js';
import { parse, zPaging, zUuid } from '../../lib/validate.js';
import { getCaptainProfile, requiredDocsFor } from '../captains/profile.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../core/settings.js';
import { zoneDto } from '../core/zones.js';
import { manualAssign, startDispatch } from '../dispatch/service.js';
import { getMerchant, merchantDetailDto, MERCHANT_SELECT, merchantUserIds } from '../merchants/service.js';
import { merchantDocDto } from '../merchants/routes.js';
import { notify, notifyMany } from '../notifications/service.js';
import { DELIVERY_SELECT, deliveryDto, loadOrder, orderDto } from '../orders/dto.js';
import { cancelOrder } from '../orders/service.js';
import { refundOrderPayments } from '../payments/service.js';
import { muscatNow } from '../core/time.js';

const zReview = z.object({ status: z.enum(['approved', 'rejected']), reason: z.string().max(300).optional() }).refine((r) => r.status === 'approved' || r.reason, { message: 'A reason is required when rejecting' });
const geoPolygon = z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1) });

const pricingRuleInput = z.object({
  name: z.string().trim().min(2).max(80),
  zoneId: zUuid.nullable().optional(),
  deliveryType: z.enum(['marketplace', 'merchant_delivery', 'c2c']).nullable().optional(),
  vehicleType: z.enum(['bike', 'car', 'van']).nullable().optional(),
  baseFeeBaisa: z.number().int().min(0).max(100_000),
  perKmBaisa: z.number().int().min(0).max(10_000),
  includedKm: z.number().min(0).max(50).default(0),
  minFeeBaisa: z.number().int().min(0).max(100_000).default(0),
  maxFeeBaisa: z.number().int().min(0).max(500_000).nullable().optional(),
  maxDistanceKm: z.number().min(1).max(200).default(40),
  surgeMultiplier: z.number().min(1).max(5).default(1),
  captainShareBps: z.number().int().min(0).max(10000).default(8000),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
const pricingDto = (r: any) => ({
  id: r.id, name: r.name, zoneId: r.zone_id, deliveryType: r.delivery_type, vehicleType: r.vehicle_type, baseFeeBaisa: r.base_fee_baisa, perKmBaisa: r.per_km_baisa,
  includedKm: Number(r.included_km), minFeeBaisa: r.min_fee_baisa, maxFeeBaisa: r.max_fee_baisa, maxDistanceKm: Number(r.max_distance_km),
  surgeMultiplier: Number(r.surge_multiplier), captainShareBps: r.captain_share_bps, priority: r.priority, isActive: r.is_active,
});

const dispatchRuleInput = z.object({
  zoneId: zUuid.nullable(),
  strategy: z.enum(['sequential', 'broadcast', 'manual']),
  autoDispatch: z.boolean(),
  dispatchOnAccept: z.boolean(),
  searchRadiusKm: z.number().min(0.5).max(50),
  radiusStepKm: z.number().min(0).max(20),
  maxRadiusKm: z.number().min(0.5).max(100),
  maxRounds: z.number().int().min(1).max(30),
  broadcastSize: z.number().int().min(1).max(20),
  offerTimeoutS: z.number().int().min(5).max(600),
  locationMaxAgeS: z.number().int().min(10).max(3600),
  respectSchedule: z.boolean(),
  bikeBlackout: z.array(z.object({ months: z.array(z.number().int().min(1).max(12)).optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional(), start: z.string(), end: z.string() })).default([]),
  weightDistance: z.number().min(0).max(1),
  weightRating: z.number().min(0).max(1),
  weightAcceptance: z.number().min(0).max(1),
});
const dispatchDto = (r: any) => ({
  zoneId: r.zone_id, strategy: r.strategy, autoDispatch: r.auto_dispatch, dispatchOnAccept: r.dispatch_on_accept, searchRadiusKm: Number(r.search_radius_km),
  radiusStepKm: Number(r.radius_step_km), maxRadiusKm: Number(r.max_radius_km), maxRounds: r.max_rounds, broadcastSize: r.broadcast_size, offerTimeoutS: r.offer_timeout_s,
  locationMaxAgeS: r.location_max_age_s, respectSchedule: r.respect_schedule, bikeBlackout: r.bike_blackout, weightDistance: Number(r.weight_distance),
  weightRating: Number(r.weight_rating), weightAcceptance: Number(r.weight_acceptance),
});
const planInput = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,30}$/), nameEn: z.string().min(2), nameAr: z.string().min(2), monthlyFeeBaisa: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10000), features: z.record(z.string(), z.unknown()).default({}), isActive: z.boolean().default(true),
});
const planDto = (p: any) => ({ id: p.id, code: p.code, nameEn: p.name_en, nameAr: p.name_ar, monthlyFeeBaisa: p.monthly_fee_baisa, commissionBps: p.commission_bps, features: p.features, isActive: p.is_active });

const ADMIN_ORDER_SELECT = `SELECT o.*, m.slug AS m_slug, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.logo_url AS m_logo, m.contact_phone AS m_phone FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id`;

export default async function adminRoutes(app: FastifyInstance) {
  // ───────── Merchants ─────────
  app.get('/admin/merchants', async (req) => {
    requirePerm(req, 'merchants:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), q: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.status) { params.push(f.status); where.push(`m.status = $${params.length}`); }
    if (f.q) { params.push(`%${f.q}%`); where.push(`(m.name_en ILIKE $${params.length} OR m.name_ar ILIKE $${params.length} OR m.slug ILIKE $${params.length} OR m.cr_number ILIKE $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(pool, `${MERCHANT_SELECT} ${w} ORDER BY m.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM merchants m ${w}`, params);
    return { items: await Promise.all(rows.map((m) => merchantDetailDto(pool, m))), total: total.n, limit: f.limit, offset: f.offset };
  });

  app.get('/admin/merchants/:id', async (req) => {
    requirePerm(req, 'merchants:read');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const m = await getMerchant(pool, id);
    const [docs, staff, subs, stats] = await Promise.all([
      q(pool, `SELECT * FROM merchant_documents WHERE merchant_id = $1 ORDER BY created_at DESC`, [id]),
      q(pool, `SELECT u.id, u.full_name, u.email, u.phone, r.key FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id WHERE ur.merchant_id = $1`, [id]),
      q(pool, `SELECT ms.*, p.code FROM merchant_subscriptions ms JOIN subscription_plans p ON p.id = ms.plan_id WHERE merchant_id = $1 ORDER BY started_at DESC`, [id]),
      one(pool, `SELECT count(*)::int AS orders, COALESCE(SUM(total_baisa) FILTER (WHERE status IN ('delivered','completed')),0)::int AS gmv FROM orders WHERE merchant_id = $1`, [id]),
    ]);
    const { signFileUrl } = await import('../../integrations/storage.js');
    return {
      ...(await merchantDetailDto(pool, m)),
      documents: docs.map((d) => ({ ...merchantDocDto(d), fileUrl: signFileUrl(d.file_id) })),
      staff: staff.map((s) => ({ userId: s.id, fullName: s.full_name, email: s.email, phone: s.phone, role: s.key })),
      subscriptions: subs.map((s) => ({ id: s.id, planCode: s.code, status: s.status, startedAt: s.started_at, currentPeriodEnd: s.current_period_end })),
      stats: { orders: stats.orders, gmvBaisa: stats.gmv },
    };
  });

  app.patch('/admin/merchants/:id', async (req) => {
    requirePerm(req, 'merchants:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ planId: zUuid.optional(), commissionBpsOverride: z.number().int().min(0).max(10000).nullable().optional() }), req.body);
    await tx(async (c) => {
      if (b.planId) {
        const p = await one(c, `SELECT id FROM subscription_plans WHERE id = $1`, [b.planId]);
        if (!p) throw badRequest('Unknown plan');
        await q(c, `UPDATE merchant_subscriptions SET status = 'cancelled', cancelled_at = now() WHERE merchant_id = $1 AND status = 'active'`, [id]);
        await q(c, `INSERT INTO merchant_subscriptions (merchant_id, plan_id, current_period_end) VALUES ($1,$2, now() + interval '1 month')`, [id, b.planId]);
        await q(c, `UPDATE merchants SET plan_id = $2 WHERE id = $1`, [id, b.planId]);
      }
      if (b.commissionBpsOverride !== undefined) await q(c, `UPDATE merchants SET commission_bps_override = $2 WHERE id = $1`, [id, b.commissionBpsOverride]);
      await audit(c, req, 'merchant.commercial_update', 'merchant', id, b);
    });
    return merchantDetailDto(pool, await getMerchant(pool, id));
  });

  app.post('/admin/merchants/:id/:action', async (req) => {
    const { id, action } = parse(z.object({ id: zUuid, action: z.enum(['approve', 'reject', 'suspend', 'reactivate']) }), req.params);
    const auth = requirePerm(req, ...(action === 'approve' || action === 'reject' ? ['merchants:review'] : ['merchants:manage']));
    const b = parse(z.object({ reason: z.string().max(300).optional() }), req.body);
    await tx(async (c) => {
      const m = await one(c, `SELECT * FROM merchants WHERE id = $1 FOR UPDATE`, [id]);
      if (!m) throw notFound('Merchant');
      const allowed: Record<string, string[]> = { approve: ['pending_review', 'rejected'], reject: ['pending_review'], suspend: ['active'], reactivate: ['suspended'] };
      if (!allowed[action].includes(m.status)) throw conflict(`Cannot ${action} a merchant that is ${m.status}`, 'invalid_transition');
      if ((action === 'reject' || action === 'suspend') && !b.reason) throw badRequest('A reason is required');
      const to = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' }[action];
      await q(c, `UPDATE merchants SET status = $2, rejection_reason = $3, approved_at = CASE WHEN $2 = 'active' AND approved_at IS NULL THEN now() ELSE approved_at END,
                  approved_by = CASE WHEN $4 THEN $5::uuid ELSE approved_by END, updated_at = now() WHERE id = $1`, [id, to, b.reason ?? null, action === 'approve', auth.userId]);
      await audit(c, req, `merchant.${action}`, 'merchant', id, b);
      const owners = await merchantUserIds(c, id, 'merchant.store:manage');
      if (action === 'approve') await notifyMany(c, owners, 'merchant.approved', { name: m.name_en });
      if (action === 'reject') await notifyMany(c, owners, 'merchant.rejected', { reason: b.reason });
    });
    return merchantDetailDto(pool, await getMerchant(pool, id));
  });

  app.post('/admin/merchant-documents/:id/review', async (req) => {
    const auth = requirePerm(req, 'merchants:review');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(zReview, req.body);
    const d = await one(pool, `UPDATE merchant_documents SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1 RETURNING *`, [id, b.status, b.reason ?? null, auth.userId]);
    if (!d) throw notFound('Document');
    await audit(pool, req, 'merchant_document.review', 'merchant_document', id, b);
    return merchantDocDto(d);
  });

  // ───────── Captains ─────────
  app.get('/admin/captains', async (req) => {
    requirePerm(req, 'captains:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), online: z.enum(['true', 'false']).optional(), q: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.status) { params.push(f.status); where.push(`c.status = $${params.length}`); }
    if (f.online) { params.push(f.online === 'true'); where.push(`c.is_online = $${params.length}`); }
    if (f.q) { params.push(`%${f.q}%`); where.push(`(u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR c.vehicle_plate ILIKE $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      pool,
      `SELECT c.*, u.full_name, u.phone, fp.name AS fleet_name, ${latLngCols('cl.location', 'cl')}, cl.updated_at AS location_at,
              (SELECT count(*)::int FROM deliveries d WHERE d.captain_id = c.id AND d.status IN ('assigned','at_pickup','picked_up','at_dropoff')) AS active_deliveries,
              (SELECT count(*)::int FROM captain_documents cd WHERE cd.captain_id = c.id AND cd.status = 'pending') AS pending_documents
         FROM captains c JOIN users u ON u.id = c.user_id LEFT JOIN fleet_partners fp ON fp.id = c.fleet_partner_id LEFT JOIN captain_locations cl ON cl.captain_id = c.id
         ${w} ORDER BY c.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
      params,
    );
    const total = await one(pool, `SELECT count(*)::int AS n FROM captains c JOIN users u ON u.id = c.user_id ${w}`, params);
    return {
      items: rows.map((c) => ({
        id: c.id, fullName: c.full_name, phone: c.phone, status: c.status, employmentModel: c.employment_model, fleetPartner: c.fleet_name, nationality: c.nationality,
        vehicleType: c.vehicle_type, vehiclePlate: c.vehicle_plate, isOnline: c.is_online, ratingAvg: Number(c.rating_avg), activeDeliveries: c.active_deliveries,
        pendingDocuments: c.pending_documents, location: rowPoint(c, 'cl'), locationAt: c.location_at, createdAt: c.created_at,
      })),
      total: total.n, limit: f.limit, offset: f.offset,
    };
  });

  app.get('/admin/captains/:id', async (req) => {
    requirePerm(req, 'captains:read');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const profile = await getCaptainProfile(pool, id);
    const [stats, recent, cash] = await Promise.all([
      one(pool, `SELECT count(*) FILTER (WHERE status = 'delivered')::int AS delivered, count(*) FILTER (WHERE status = 'failed')::int AS failed FROM deliveries WHERE captain_id = $1`, [id]),
      q(pool, `SELECT d.id, d.status, d.updated_at, o.number FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.captain_id = $1 ORDER BY d.updated_at DESC LIMIT 10`, [id]),
      one(pool, `SELECT COALESCE(-SUM(amount_baisa),0)::int AS cash FROM ledger_entries WHERE account_type = 'captain' AND account_id = $1 AND entry_type IN ('cod_collected','cod_remitted')`, [id]),
    ]);
    await audit(pool, req, 'captain.view_documents', 'captain', id);
    return { ...profile, stats: { ...stats, cashHeldBaisa: cash.cash }, recentDeliveries: recent.map((r) => ({ id: r.id, status: r.status, orderNumber: r.number, updatedAt: r.updated_at })) };
  });

  app.post('/admin/captains/:id/:action', async (req) => {
    const { id, action } = parse(z.object({ id: zUuid, action: z.enum(['approve', 'reject', 'suspend', 'reactivate']) }), req.params);
    const auth = requirePerm(req, ...(action === 'approve' || action === 'reject' ? ['captains:review'] : ['captains:manage']));
    const b = parse(z.object({ reason: z.string().max(300).optional(), employmentModel: z.enum(['independent', 'fleet']).optional(), fleetPartnerId: zUuid.optional() }), req.body);
    await tx(async (c) => {
      const cap = await one(c, `SELECT * FROM captains WHERE id = $1 FOR UPDATE`, [id]);
      if (!cap) throw notFound('Captain');
      const allowed: Record<string, string[]> = { approve: ['pending_review', 'pending_documents', 'rejected'], reject: ['pending_review', 'pending_documents'], suspend: ['active'], reactivate: ['suspended'] };
      if (!allowed[action].includes(cap.status)) throw conflict(`Cannot ${action} a captain that is ${cap.status}`, 'invalid_transition');
      if ((action === 'reject' || action === 'suspend') && !b.reason) throw badRequest('A reason is required');
      if (action === 'approve') {
        const settings = await getSettings(c);
        const model = b.employmentModel ?? cap.employment_model;
        const fleet = b.fleetPartnerId ?? cap.fleet_partner_id;
        if (model === 'fleet' && !fleet) throw badRequest('Fleet captains must be linked to a fleet partner');
        if (settings.requireFleetForNonOmani && model === 'independent' && (cap.nationality ?? '').toLowerCase() !== 'omani')
          throw conflict('Non-Omani captains must be onboarded through a licensed fleet partner (platform setting requireFleetForNonOmani)', 'fleet_required');
        const docs = await q(c, `SELECT DISTINCT ON (doc_type) doc_type, status, expires_at FROM captain_documents WHERE captain_id = $1 ORDER BY doc_type, created_at DESC`, [id]);
        const approved = new Set(docs.filter((d) => d.status === 'approved' && (!d.expires_at || d.expires_at >= muscatNow().date)).map((d) => d.doc_type));
        const missing = requiredDocsFor(settings, { ...cap, employment_model: model }).filter((d) => !approved.has(d));
        if (missing.length) throw conflict(`Approve these documents first: ${missing.join(', ')}`, 'documents_incomplete');
        await q(c, `UPDATE captains SET employment_model = $2, fleet_partner_id = $3 WHERE id = $1`, [id, model, fleet ?? null]);
      }
      const to = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' }[action];
      await q(c, `UPDATE captains SET status = $2, rejection_reason = $3, is_online = CASE WHEN $2 = 'active' THEN is_online ELSE false END,
                  approved_at = CASE WHEN $4 THEN now() ELSE approved_at END, approved_by = CASE WHEN $4 THEN $5::uuid ELSE approved_by END, updated_at = now() WHERE id = $1`,
        [id, to, b.reason ?? null, action === 'approve', auth.userId]);
      await audit(c, req, `captain.${action}`, 'captain', id, b);
      if (action === 'approve') await notify(c, cap.user_id, 'captain.approved');
      if (action === 'reject') await notify(c, cap.user_id, 'captain.rejected', { reason: b.reason });
      invalidateAuthCache(cap.user_id);
    });
    return getCaptainProfile(pool, id);
  });

  app.post('/admin/captain-documents/:id/review', async (req) => {
    const auth = requirePerm(req, 'captains:review');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(zReview, req.body);
    return tx(async (c) => {
      const d = await one(c, `UPDATE captain_documents SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1 RETURNING *`, [id, b.status, b.reason ?? null, auth.userId]);
      if (!d) throw notFound('Document');
      if (b.status === 'rejected') {
        const cap = await one(c, `UPDATE captains SET status = CASE WHEN status = 'pending_review' THEN 'pending_documents' ELSE status END WHERE id = $1 RETURNING user_id`, [d.captain_id]);
        await notify(c, cap.user_id, 'captain.document_rejected', { docType: d.doc_type, reason: b.reason });
        invalidateAuthCache(cap.user_id);
      }
      await audit(c, req, 'captain_document.review', 'captain_document', id, b);
      return { id: d.id, docType: d.doc_type, status: d.status, rejectionReason: d.rejection_reason };
    });
  });

  // ───────── Fleet partners ─────────
  app.get('/admin/fleet-partners', async (req) => {
    requirePerm(req, 'captains:read');
    const rows = await q(pool, `SELECT fp.*, (SELECT count(*)::int FROM captains c WHERE c.fleet_partner_id = fp.id) AS captains FROM fleet_partners fp ORDER BY name`);
    return { items: rows.map((r) => ({ id: r.id, name: r.name, crNumber: r.cr_number, licenceNumber: r.licence_number, licenceExpiresAt: r.licence_expires_at, contactName: r.contact_name, contactPhone: r.contact_phone, status: r.status, captains: r.captains })) };
  });
  app.post('/admin/fleet-partners', async (req, reply) => {
    requirePerm(req, 'captains:manage');
    const b = parse(z.object({ name: z.string().min(2), crNumber: z.string().optional(), licenceNumber: z.string().optional(), licenceExpiresAt: z.string().date().optional(), contactName: z.string().optional(), contactPhone: z.string().optional(), contactEmail: z.string().email().optional() }), req.body);
    const r = await one(pool, `INSERT INTO fleet_partners (name, cr_number, licence_number, licence_expires_at, contact_name, contact_phone, contact_email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [b.name, b.crNumber, b.licenceNumber, b.licenceExpiresAt, b.contactName, b.contactPhone, b.contactEmail]);
    await audit(pool, req, 'fleet_partner.create', 'fleet_partner', r.id, b);
    reply.code(201);
    return { id: r.id };
  });

  // ───────── Live operations ─────────
  app.get('/admin/operations/live', async (req) => {
    requirePerm(req, 'deliveries:read');
    const [deliveries, captains, kpi] = await Promise.all([
      q(pool, `${DELIVERY_SELECT.replace('FROM deliveries d', ', o.number AS order_number, o.type AS order_type, o.status AS order_status, m.name_en AS merchant_name, d.created_at AS d_created FROM deliveries d JOIN orders o ON o.id = d.order_id LEFT JOIN merchants m ON m.id = o.merchant_id')}
               WHERE d.status IN ('created','searching','unassigned','assigned','at_pickup','picked_up','at_dropoff') ORDER BY d.created_at LIMIT 500`),
      q(pool, `SELECT c.id, u.full_name, c.vehicle_type, ${latLngCols('cl.location', 'cl')}, cl.updated_at,
                (SELECT count(*)::int FROM deliveries d WHERE d.captain_id = c.id AND d.status IN ('assigned','at_pickup','picked_up','at_dropoff')) AS active
                 FROM captains c JOIN users u ON u.id = c.user_id JOIN captain_locations cl ON cl.captain_id = c.id WHERE c.is_online AND c.status = 'active'`),
      one(pool, `SELECT
           (SELECT count(*)::int FROM orders WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Muscat') AT TIME ZONE 'Asia/Muscat') AS orders_today,
           (SELECT COALESCE(SUM(total_baisa),0)::int FROM orders WHERE status IN ('delivered','completed') AND delivered_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Muscat') AT TIME ZONE 'Asia/Muscat') AS gmv_today,
           (SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - o.placed_at)) / 60) FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.delivered_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Muscat') AT TIME ZONE 'Asia/Muscat') AS avg_minutes`),
    ]);
    const ds = deliveries.map((d) => ({ ...deliveryDto(d, 'ops'), orderId: d.order_id, orderNumber: d.order_number, orderType: d.order_type, orderStatus: d.order_status, merchantName: d.merchant_name, createdAt: d.d_created, dispatchRound: d.dispatch_round }));
    return {
      kpis: {
        activeDeliveries: ds.filter((d) => !['created', 'searching', 'unassigned'].includes(d.status)).length,
        unassigned: ds.filter((d) => d.status === 'unassigned').length,
        searching: ds.filter((d) => d.status === 'searching').length,
        onlineCaptains: captains.length,
        busyCaptains: captains.filter((c) => c.active > 0).length,
        ordersToday: kpi.orders_today,
        gmvTodayBaisa: kpi.gmv_today,
        avgDeliveryMinutesToday: kpi.avg_minutes != null ? Math.round(Number(kpi.avg_minutes) * 10) / 10 : null,
      },
      deliveries: ds,
      captains: captains.map((c) => ({ id: c.id, fullName: c.full_name, vehicleType: c.vehicle_type, location: rowPoint(c, 'cl'), activeDeliveries: c.active, updatedAt: c.updated_at })),
    };
  });

  // ───────── Orders & deliveries ─────────
  app.get('/admin/orders', async (req) => {
    requirePerm(req, 'orders:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), type: z.string().optional(), merchantId: zUuid.optional(), q: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.status) { params.push(f.status.split(',')); where.push(`o.status = ANY($${params.length})`); }
    if (f.type) { params.push(f.type); where.push(`o.type = $${params.length}`); }
    if (f.merchantId) { params.push(f.merchantId); where.push(`o.merchant_id = $${params.length}`); }
    if (f.q) { params.push(`%${f.q}%`); where.push(`(o.number ILIKE $${params.length} OR o.customer_phone ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(pool, `${ADMIN_ORDER_SELECT} ${w} ORDER BY o.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM orders o ${w}`, params);
    return { items: await Promise.all(rows.map((o) => orderDto(pool, o, 'ops', { withTimeline: false }))), total: total.n, limit: f.limit, offset: f.offset };
  });

  app.post('/admin/orders/:id/cancel', async (req) => {
    const auth = requirePerm(req, 'orders:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await tx(async (c) => {
      await cancelOrder(c, id, auth.userId, b.reason);
      await audit(c, req, 'order.cancel', 'order', id, b);
    });
    return loadOrder(pool, id, 'ops');
  });

  app.post('/admin/orders/:id/refund', async (req) => {
    const auth = requirePerm(req, 'orders:refund');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ amountBaisa: z.number().int().min(1), reason: z.string().trim().min(3).max(300) }), req.body);
    const refunds = await tx(async (c) => {
      const paid = await one(c, `SELECT COALESCE(SUM(amount_baisa - refunded_baisa),0)::int AS refundable FROM payments WHERE order_id = $1 AND status IN ('paid','partially_refunded')`, [id]);
      if (b.amountBaisa > paid.refundable) throw conflict(`At most ${paid.refundable} baisa can be refunded`, 'refund_exceeds_payment');
      const r = await refundOrderPayments(c, id, b.reason, auth.userId, b.amountBaisa);
      await audit(c, req, 'order.refund', 'order', id, b);
      return r;
    });
    return { refunds: refunds.map((r) => ({ id: r.id, amountBaisa: r.amount_baisa, status: r.status })), order: await loadOrder(pool, id, 'ops') };
  });

  app.get('/admin/deliveries/:id', async (req) => {
    requirePerm(req, 'deliveries:read');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const d = await one(pool, `${DELIVERY_SELECT} WHERE d.id = $1`, [id]);
    if (!d) throw notFound('Delivery');
    const [offers, events, track, pod] = await Promise.all([
      q(pool, `SELECT o.*, u.full_name FROM delivery_offers o JOIN captains c ON c.id = o.captain_id JOIN users u ON u.id = c.user_id WHERE o.delivery_id = $1 ORDER BY o.offered_at`, [id]),
      q(pool, `SELECT * FROM delivery_events WHERE delivery_id = $1 ORDER BY created_at, id`, [id]),
      q(pool, `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, recorded_at FROM delivery_tracks WHERE delivery_id = $1 ORDER BY recorded_at`, [id]),
      one(pool, `SELECT * FROM proofs_of_delivery WHERE delivery_id = $1`, [id]),
    ]);
    const { signFileUrl } = await import('../../integrations/storage.js');
    return {
      ...deliveryDto(d, 'ops'), orderId: d.order_id, dispatchRound: d.dispatch_round, currentRadiusKm: d.current_radius_km != null ? Number(d.current_radius_km) : null,
      offers: offers.map((o) => ({ id: o.id, captainId: o.captain_id, captainName: o.full_name, status: o.status, round: o.round, score: o.score != null ? Number(o.score) : null, distanceToPickupM: o.distance_to_pickup_m, offeredAt: o.offered_at, respondedAt: o.responded_at, rejectReason: o.reject_reason })),
      events: events.map((e) => ({ type: e.type, from: e.from_status, to: e.to_status, actorUserId: e.actor_user_id, data: e.data, at: e.created_at })),
      track: track.map((t) => ({ lat: Number(t.lat), lng: Number(t.lng), at: t.recorded_at })),
      proof: pod ? { recipientName: pod.recipient_name, pinVerified: pod.pin_verified, codCollectedBaisa: pod.cod_collected_baisa, note: pod.note, photoUrl: pod.photo_file_id ? signFileUrl(pod.photo_file_id) : null, at: pod.created_at } : null,
    };
  });

  app.post('/admin/deliveries/:id/assign', async (req) => {
    const auth = requirePerm(req, 'deliveries:dispatch');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ captainId: zUuid }), req.body);
    await tx(async (c) => {
      await manualAssign(c, id, b.captainId, auth.userId);
      await audit(c, req, 'delivery.assign', 'delivery', id, b);
    });
    return deliveryDto(await one(pool, `${DELIVERY_SELECT} WHERE d.id = $1`, [id]), 'ops');
  });

  app.post('/admin/deliveries/:id/redispatch', async (req) => {
    requirePerm(req, 'deliveries:dispatch');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    await tx(async (c) => {
      const d = await one(c, `SELECT status FROM deliveries WHERE id = $1 FOR UPDATE`, [id]);
      if (!d) throw notFound('Delivery');
      if (!['unassigned', 'created'].includes(d.status)) throw conflict('Only unassigned deliveries can be re-dispatched', 'invalid_transition');
      await q(c, `UPDATE deliveries SET dispatch_round = 0 WHERE id = $1`, [id]);
      await startDispatch(c, id);
      await audit(c, req, 'delivery.redispatch', 'delivery', id);
    });
    return deliveryDto(await one(pool, `${DELIVERY_SELECT} WHERE d.id = $1`, [id]), 'ops');
  });

  // ───────── Zones, pricing, dispatch rules, settings, plans ─────────
  app.get('/admin/zones', async (req) => {
    requirePerm(req, 'deliveries:read', 'zones:manage');
    const rows = await q(pool, `SELECT id, code, name_en, name_ar, is_active, ST_AsGeoJSON(boundary)::json AS boundary FROM zones ORDER BY code`);
    return { items: rows.map(zoneDto) };
  });
  const zoneInput = z.object({ code: z.string().regex(/^[A-Z0-9-]{2,30}$/), nameEn: z.string().min(2), nameAr: z.string().min(2), isActive: z.boolean().default(true), boundary: geoPolygon });
  app.post('/admin/zones', async (req, reply) => {
    requirePerm(req, 'zones:manage');
    const b = parse(zoneInput, req.body);
    const r = await one(pool, `INSERT INTO zones (code, name_en, name_ar, is_active, boundary) VALUES ($1,$2,$3,$4, ST_GeomFromGeoJSON($5)::geography)
      RETURNING id, code, name_en, name_ar, is_active, ST_AsGeoJSON(boundary)::json AS boundary`, [b.code, b.nameEn, b.nameAr, b.isActive, JSON.stringify(b.boundary)]).catch((e) => {
      if (String(e.message).includes('duplicate')) throw conflict('Zone code already exists');
      throw badRequest(`Invalid polygon: ${e.message}`);
    });
    await audit(pool, req, 'zone.create', 'zone', r!.id, { code: b.code });
    reply.code(201);
    return zoneDto(r);
  });
  app.patch('/admin/zones/:id', async (req) => {
    requirePerm(req, 'zones:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(zoneInput.partial(), req.body);
    const r = await one(pool, `UPDATE zones SET code = COALESCE($2,code), name_en = COALESCE($3,name_en), name_ar = COALESCE($4,name_ar), is_active = COALESCE($5,is_active),
        boundary = CASE WHEN $6::text IS NULL THEN boundary ELSE ST_GeomFromGeoJSON($6)::geography END, updated_at = now() WHERE id = $1
        RETURNING id, code, name_en, name_ar, is_active, ST_AsGeoJSON(boundary)::json AS boundary`, [id, b.code, b.nameEn, b.nameAr, b.isActive, b.boundary ? JSON.stringify(b.boundary) : null]);
    if (!r) throw notFound('Zone');
    await audit(pool, req, 'zone.update', 'zone', id, { ...b, boundary: b.boundary ? 'changed' : undefined });
    return zoneDto(r);
  });

  app.get('/admin/pricing-rules', async (req) => {
    requirePerm(req, 'pricing:manage', 'deliveries:read');
    return { items: (await q(pool, `SELECT * FROM pricing_rules ORDER BY zone_id NULLS FIRST, delivery_type NULLS FIRST, vehicle_type NULLS FIRST, priority DESC`)).map(pricingDto) };
  });
  app.post('/admin/pricing-rules', async (req, reply) => {
    requirePerm(req, 'pricing:manage');
    const b = parse(pricingRuleInput, req.body);
    const r = await one(pool, `INSERT INTO pricing_rules (name, zone_id, delivery_type, vehicle_type, base_fee_baisa, per_km_baisa, included_km, min_fee_baisa, max_fee_baisa, max_distance_km, surge_multiplier, captain_share_bps, priority, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [b.name, b.zoneId ?? null, b.deliveryType ?? null, b.vehicleType ?? null, b.baseFeeBaisa, b.perKmBaisa, b.includedKm, b.minFeeBaisa, b.maxFeeBaisa ?? null, b.maxDistanceKm, b.surgeMultiplier, b.captainShareBps, b.priority, b.isActive]);
    await audit(pool, req, 'pricing_rule.create', 'pricing_rule', r.id, b);
    reply.code(201);
    return pricingDto(r);
  });
  app.patch('/admin/pricing-rules/:id', async (req) => {
    requirePerm(req, 'pricing:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const cur = await one(pool, `SELECT * FROM pricing_rules WHERE id = $1`, [id]);
    if (!cur) throw notFound('Pricing rule');
    const b = parse(pricingRuleInput, { ...pricingDto(cur), ...(req.body as object) });
    const r = await one(pool, `UPDATE pricing_rules SET name=$2, zone_id=$3, delivery_type=$4, vehicle_type=$5, base_fee_baisa=$6, per_km_baisa=$7, included_km=$8, min_fee_baisa=$9, max_fee_baisa=$10,
        max_distance_km=$11, surge_multiplier=$12, captain_share_bps=$13, priority=$14, is_active=$15, updated_at=now() WHERE id = $1 RETURNING *`,
      [id, b.name, b.zoneId ?? null, b.deliveryType ?? null, b.vehicleType ?? null, b.baseFeeBaisa, b.perKmBaisa, b.includedKm, b.minFeeBaisa, b.maxFeeBaisa ?? null, b.maxDistanceKm, b.surgeMultiplier, b.captainShareBps, b.priority, b.isActive]);
    await audit(pool, req, 'pricing_rule.update', 'pricing_rule', id, req.body);
    return pricingDto(r);
  });
  app.delete('/admin/pricing-rules/:id', async (req, reply) => {
    requirePerm(req, 'pricing:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    await q(pool, `DELETE FROM pricing_rules WHERE id = $1`, [id]);
    await audit(pool, req, 'pricing_rule.delete', 'pricing_rule', id);
    reply.code(204);
  });

  app.get('/admin/dispatch-rules', async (req) => {
    requirePerm(req, 'dispatch_rules:manage', 'deliveries:read');
    return { items: (await q(pool, `SELECT * FROM dispatch_rules ORDER BY zone_id NULLS FIRST`)).map(dispatchDto) };
  });
  app.put('/admin/dispatch-rules', async (req) => {
    requirePerm(req, 'dispatch_rules:manage');
    const b = parse(dispatchRuleInput, req.body);
    if (b.maxRadiusKm < b.searchRadiusKm) throw badRequest('maxRadiusKm must be at least searchRadiusKm');
    const vals = [b.strategy, b.autoDispatch, b.dispatchOnAccept, b.searchRadiusKm, b.radiusStepKm, b.maxRadiusKm, b.maxRounds, b.broadcastSize, b.offerTimeoutS, b.locationMaxAgeS, b.respectSchedule, JSON.stringify(b.bikeBlackout), b.weightDistance, b.weightRating, b.weightAcceptance];
    const cols = `strategy, auto_dispatch, dispatch_on_accept, search_radius_km, radius_step_km, max_radius_km, max_rounds, broadcast_size, offer_timeout_s, location_max_age_s, respect_schedule, bike_blackout, weight_distance, weight_rating, weight_acceptance`;
    const sets = cols.split(', ').map((c, i) => `${c} = $${i + 2}`).join(', ');
    let r = await one(pool, `UPDATE dispatch_rules SET ${sets}, updated_at = now() WHERE zone_id IS NOT DISTINCT FROM $1 RETURNING *`, [b.zoneId, ...vals]);
    if (!r) r = await one(pool, `INSERT INTO dispatch_rules (zone_id, ${cols}) VALUES ($1, ${vals.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`, [b.zoneId, ...vals]);
    await audit(pool, req, 'dispatch_rule.upsert', 'dispatch_rule', r.id, b);
    return dispatchDto(r);
  });

  app.get('/admin/settings', async (req) => {
    requirePerm(req, 'settings:manage', 'finance:read', 'deliveries:read');
    return getSettings(pool);
  });
  app.put('/admin/settings', async (req) => {
    const auth = requirePerm(req, 'settings:manage');
    const b = parse(z.object({
      vatRateBps: z.number().int().min(0).max(5000).optional(), serviceFeeBaisa: z.number().int().min(0).max(10_000).optional(), defaultCommissionBps: z.number().int().min(0).max(10000).optional(),
      codMaxBaisa: z.number().int().min(0).optional(), captainCashLimitBaisa: z.number().int().min(0).optional(), merchantAcceptTimeoutMinutes: z.number().int().min(1).max(120).optional(),
      pendingPaymentTimeoutMinutes: z.number().int().min(5).max(240).optional(), requireFleetForNonOmani: z.boolean().optional(),
      requiredCaptainDocuments: z.array(z.string()).optional(), supportPhone: z.string().optional(),
      platformLegalName: z.string().max(200).optional(), platformCrNumber: z.string().max(40).optional(), platformVatNumber: z.string().max(40).optional(),
      platformAddress: z.string().max(300).optional(), captainDocumentExpiryNoticeDays: z.number().int().min(1).max(90).optional(),
    }).strict(), req.body);
    const s = await updateSettings(pool, b as Partial<typeof DEFAULT_SETTINGS>, auth.userId);
    await audit(pool, req, 'settings.update', 'platform_settings', null, b);
    return s;
  });

  app.get('/admin/plans', async (req) => {
    requirePerm(req, 'plans:manage', 'merchants:read');
    return { items: (await q(pool, `SELECT * FROM subscription_plans ORDER BY monthly_fee_baisa`)).map(planDto) };
  });
  app.post('/admin/plans', async (req, reply) => {
    requirePerm(req, 'plans:manage');
    const b = parse(planInput, req.body);
    const r = await one(pool, `INSERT INTO subscription_plans (code, name_en, name_ar, monthly_fee_baisa, commission_bps, features, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [b.code, b.nameEn, b.nameAr, b.monthlyFeeBaisa, b.commissionBps, JSON.stringify(b.features), b.isActive]);
    await audit(pool, req, 'plan.create', 'plan', r.id, b);
    reply.code(201);
    return planDto(r);
  });
  app.patch('/admin/plans/:id', async (req) => {
    requirePerm(req, 'plans:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(planInput.partial(), req.body);
    const r = await one(pool, `UPDATE subscription_plans SET code = COALESCE($2,code), name_en = COALESCE($3,name_en), name_ar = COALESCE($4,name_ar), monthly_fee_baisa = COALESCE($5,monthly_fee_baisa),
        commission_bps = COALESCE($6,commission_bps), features = COALESCE($7,features), is_active = COALESCE($8,is_active) WHERE id = $1 RETURNING *`,
      [id, b.code, b.nameEn, b.nameAr, b.monthlyFeeBaisa, b.commissionBps, b.features ? JSON.stringify(b.features) : null, b.isActive]);
    if (!r) throw notFound('Plan');
    await audit(pool, req, 'plan.update', 'plan', id, b);
    return planDto(r);
  });

  // ───────── Users, staff, roles, audit ─────────
  app.get('/admin/users', async (req) => {
    requirePerm(req, 'users:read');
    const f = parse(zPaging.extend({ q: z.string().optional() }), req.query);
    const params: unknown[] = [];
    let w = '';
    if (f.q) { params.push(`%${f.q}%`); w = `WHERE u.full_name ILIKE $1 OR u.phone ILIKE $1 OR u.email ILIKE $1`; }
    const rows = await q(pool, `SELECT u.*, (SELECT array_agg(DISTINCT r.key) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
        (SELECT count(*)::int FROM orders o WHERE o.customer_user_id = u.id) AS orders FROM users u ${w} ORDER BY u.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM users u ${w}`, params);
    return { items: rows.map((u) => ({ id: u.id, fullName: u.full_name, phone: u.phone, email: u.email, status: u.status, roles: u.roles ?? [], orders: u.orders, createdAt: u.created_at, lastLoginAt: u.last_login_at })), total: total.n };
  });
  app.post('/admin/users/:id/status', async (req) => {
    const auth = requirePerm(req, 'users:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ status: z.enum(['active', 'suspended']) }), req.body);
    if (id === auth.userId) throw forbidden('You cannot change your own status');
    await tx(async (c) => {
      const r = await q(c, `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`, [id, b.status]);
      if (!r.length) throw notFound('User');
      if (b.status === 'suspended') {
        await q(c, `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
        await q(c, `UPDATE captains SET is_online = false WHERE user_id = $1`, [id]);
      }
      await audit(c, req, `user.${b.status}`, 'user', id);
    });
    invalidateAuthCache(id);
    return { id, status: b.status };
  });
  app.post('/admin/users/:id/mfa-reset', async (req) => {
    const auth = requirePerm(req, 'staff:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    if (id === auth.userId) throw forbidden('Ask another administrator to reset your two-factor authentication');
    await tx(async (c) => {
      const r = await q(c, `UPDATE users SET totp_enabled_at = NULL, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = $1 RETURNING id`, [id]);
      if (!r.length) throw notFound('User');
      await q(c, `DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [id]);
      await q(c, `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      await audit(c, req, 'user.mfa_reset', 'user', id);
    });
    invalidateAuthCache(id);
    return { id, mfaEnabled: false };
  });

  app.get('/admin/roles', async (req) => {
    requirePerm(req, 'staff:manage', 'users:read');
    const rows = await q(pool, `SELECT r.key, r.name, r.scope, COALESCE(array_agg(rp.permission_key ORDER BY rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS permissions
      FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id GROUP BY r.id ORDER BY r.scope, r.key`);
    const perms = await q(pool, `SELECT key, description FROM permissions ORDER BY key`);
    return { roles: rows, permissions: perms };
  });
  app.get('/admin/staff', async (req) => {
    requirePerm(req, 'staff:manage');
    const rows = await q(pool, `SELECT u.id, u.full_name, u.email, u.status, u.last_login_at, array_agg(r.key ORDER BY r.key) AS roles FROM user_roles ur JOIN users u ON u.id = ur.user_id
      JOIN roles r ON r.id = ur.role_id WHERE r.scope = 'platform' GROUP BY u.id ORDER BY u.full_name`);
    return { items: rows.map((r) => ({ userId: r.id, fullName: r.full_name, email: r.email, status: r.status, roles: r.roles, lastLoginAt: r.last_login_at })) };
  });
  app.post('/admin/staff', async (req, reply) => {
    const auth = requirePerm(req, 'staff:manage');
    const b = parse(z.object({ email: z.string().email(), fullName: z.string().trim().min(2), roleKeys: z.array(z.string()).min(1) }), req.body);
    const res = await tx(async (c) => {
      const roles = await q(c, `SELECT id, key FROM roles WHERE key = ANY($1) AND scope = 'platform'`, [b.roleKeys]);
      if (roles.length !== new Set(b.roleKeys).size) throw badRequest('Unknown platform role');
      if (await one(c, `SELECT 1 FROM users WHERE email = $1`, [b.email])) throw conflict('A user with this email exists; assign roles instead', 'email_taken');
      const temporaryPassword = randomToken(12);
      const u = await one(c, `INSERT INTO users (email, full_name, password_hash) VALUES ($1,$2,$3) RETURNING id`, [b.email, b.fullName, await bcrypt.hash(temporaryPassword, 12)]);
      for (const r of roles) await q(c, `INSERT INTO user_roles (user_id, role_id, created_by) VALUES ($1,$2,$3)`, [u.id, r.id, auth.userId]);
      await audit(c, req, 'staff.create', 'user', u.id, { email: b.email, roles: b.roleKeys });
      return { userId: u.id, temporaryPassword };
    });
    reply.code(201);
    return res;
  });
  app.put('/admin/staff/:userId/roles', async (req) => {
    const auth = requirePerm(req, 'staff:manage');
    const { userId } = parse(z.object({ userId: zUuid }), req.params);
    const b = parse(z.object({ roleKeys: z.array(z.string()) }), req.body);
    if (userId === auth.userId && !b.roleKeys.includes('super_admin') && auth.roles.some((r) => r.key === 'super_admin')) throw forbidden('You cannot remove your own super admin role');
    await tx(async (c) => {
      const roles = await q(c, `SELECT id FROM roles WHERE key = ANY($1) AND scope = 'platform'`, [b.roleKeys]);
      if (roles.length !== new Set(b.roleKeys).size) throw badRequest('Unknown platform role');
      await q(c, `DELETE FROM user_roles ur USING roles r WHERE r.id = ur.role_id AND r.scope = 'platform' AND ur.user_id = $1`, [userId]);
      for (const r of roles) await q(c, `INSERT INTO user_roles (user_id, role_id, created_by) VALUES ($1,$2,$3)`, [userId, r.id, auth.userId]);
      await audit(c, req, 'staff.roles', 'user', userId, b);
    });
    invalidateAuthCache(userId);
    return { userId, roleKeys: b.roleKeys };
  });
  app.get('/admin/audit-logs', async (req) => {
    requirePerm(req, 'audit:read');
    const f = parse(zPaging.extend({ entityType: z.string().optional(), entityId: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.entityType) { params.push(f.entityType); where.push(`a.entity_type = $${params.length}`); }
    if (f.entityId) { params.push(f.entityId); where.push(`a.entity_id = $${params.length}`); }
    const rows = await q(pool, `SELECT a.*, u.full_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    return { items: rows.map((a) => ({ id: Number(a.id), actor: a.full_name, actorUserId: a.actor_user_id, action: a.action, entityType: a.entity_type, entityId: a.entity_id, data: a.data, ip: a.ip, createdAt: a.created_at })) };
  });
}
