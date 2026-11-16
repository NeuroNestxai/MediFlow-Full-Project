import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { hasMerchantPerm, hasPerm, requireAuth, requireMerchantPerm } from '../../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { parse, zLatLng, zPaging, zUuid } from '../../lib/validate.js';
import { quoteDelivery } from '../core/pricing.js';
import { ACTIVE_ORDER_STATUSES, PRE_PICKUP_STATUSES } from '../core/state.js';
import { createOrderCheckout } from '../payments/service.js';
import { loadOrder, loadOrderRow, orderDto, type Viewer } from './dto.js';
import { cancelOrder, createMarketplaceOrder, createMerchantDelivery, createShipment, merchantOrderAction, priceCart } from './service.js';

export const zPlace = z.object({
  location: zLatLng.optional(),
  addressId: zUuid.optional(),
  address: z.string().max(300).optional(),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().optional(),
  notes: z.string().max(500).optional(),
}).refine((p) => p.location || p.addressId, { message: 'location or addressId is required' });

const zCart = z.object({
  merchantId: zUuid,
  items: z.array(z.object({ productId: zUuid, quantity: z.number().int().min(1).max(99), optionIds: z.array(zUuid).max(30).optional(), notes: z.string().max(300).optional() })).min(1).max(50),
  addressId: zUuid.optional(),
  dropoff: zPlace.optional(),
  paymentMethod: z.enum(['online', 'cod']),
  notes: z.string().max(500).optional(),
  source: z.enum(['app', 'storefront']).optional(),
}).refine((b) => b.addressId || b.dropoff, { message: 'addressId or dropoff is required' });

const idemKey = (h: unknown) => (typeof h === 'string' && h.length > 0 && h.length <= 100 ? h : undefined);

/** Work out how the current user relates to an order (or throw 403/404). */
export async function viewerFor(req: any, orderId: string): Promise<Viewer> {
  const auth = requireAuth(req);
  const o = await one(pool, `SELECT o.customer_user_id, o.merchant_id, d.captain_id FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.id = $1`, [orderId]);
  if (!o) throw notFound('Order');
  if (o.customer_user_id === auth.userId) return 'customer';
  if (o.merchant_id && auth.merchantPerms.get(o.merchant_id)?.has('merchant.orders:read')) return 'merchant';
  if (o.captain_id && o.captain_id === auth.captainId) return 'captain';
  if (hasPerm(auth, 'orders:read')) return 'ops';
  if (o.merchant_id && hasMerchantPerm(auth, o.merchant_id, 'merchant.orders:read')) return 'merchant';
  throw notFound('Order');
}

export default async function orderRoutes(app: FastifyInstance) {
  app.post('/quotes/delivery', async (req) => {
    const b = parse(z.object({
      type: z.enum(['marketplace', 'merchant_delivery', 'c2c']), pickup: zLatLng, dropoff: zLatLng,
      vehicleType: z.enum(['bike', 'car', 'van']).optional(), packageSize: z.enum(['small', 'medium', 'large']).optional(),
    }), req.body);
    // Same vehicle rule as shipment creation, so the quote matches the fee actually charged.
    const vehicleType = b.vehicleType ?? (b.type === 'c2c' && b.packageSize === 'large' ? 'car' : undefined);
    const { captainEarningBaisa, ...quote } = await quoteDelivery(pool, { ...b, vehicleType });
    return quote;
  });

  app.post('/orders/quote', async (req) => {
    const auth = requireAuth(req);
    const b = parse(zCart, req.body);
    return (await priceCart(pool, auth.userId, b)).breakdown;
  });

  app.post('/orders', async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(zCart, req.body);
    const id = await tx((c) => createMarketplaceOrder(c, auth.userId, b, idemKey(req.headers['idempotency-key'])));
    reply.code(201);
    return loadOrder(pool, id, 'customer');
  });

  app.post('/shipments', async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(z.object({
      pickup: zPlace, dropoff: zPlace,
      package: z.object({ size: z.enum(['small', 'medium', 'large']), description: z.string().trim().min(2).max(300), declaredValueBaisa: z.number().int().min(0).max(5_000_000).optional() }),
      vehicleType: z.enum(['bike', 'car', 'van']).optional(),
      paymentMethod: z.enum(['online', 'cod']),
      codPayer: z.enum(['sender', 'recipient']).optional(),
      notes: z.string().max(500).optional(),
    }), req.body);
    const id = await tx((c) => createShipment(c, auth.userId, b, idemKey(req.headers['idempotency-key'])));
    reply.code(201);
    return loadOrder(pool, id, 'customer');
  });

  app.get('/orders', async (req) => {
    const auth = requireAuth(req);
    const f = parse(zPaging.extend({ status: z.enum(['active', 'past']).optional() }), req.query);
    const params: unknown[] = [auth.userId];
    let where = 'o.customer_user_id = $1';
    if (f.status) { params.push(ACTIVE_ORDER_STATUSES); where += ` AND o.status ${f.status === 'active' ? '=' : '<>'} ALL($2)`.replace('= ALL', '= ANY'); }
    const rows = await q(pool, `SELECT o.*, m.slug AS m_slug, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.logo_url AS m_logo, m.contact_phone AS m_phone
      FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE ${where} ORDER BY o.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM orders o WHERE ${where}`, params);
    return { items: await Promise.all(rows.map((o) => orderDto(pool, o, 'customer', { withTimeline: false }))), total: total.n, limit: f.limit, offset: f.offset };
  });

  app.get('/orders/:id', async (req) => {
    const { id } = parse(z.object({ id: zUuid }), req.params);
    return loadOrder(pool, id, await viewerFor(req, id));
  });

  app.post('/orders/:id/cancel', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ reason: z.string().max(300).optional() }), req.body);
    await tx(async (c) => {
      const o = await one(c, `SELECT o.*, d.status AS d_status FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.id = $1 AND o.customer_user_id = $2 FOR UPDATE OF o`, [id, auth.userId]);
      if (!o) throw notFound('Order');
      const allowed = o.type === 'marketplace' ? ['pending_payment', 'placed'].includes(o.status) : ['pending_payment', 'placed', 'ready_for_pickup'].includes(o.status) && PRE_PICKUP_STATUSES.includes(o.d_status) && o.d_status !== 'at_pickup';
      if (!allowed) throw conflict('This order can no longer be cancelled. Contact support if you need help.', 'not_cancellable');
      await cancelOrder(c, id, auth.userId, b.reason ?? 'Cancelled by customer');
    });
    return loadOrder(pool, id, 'customer');
  });

  app.post('/orders/:id/checkout', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ returnUrl: z.string().url().optional() }), req.body);
    return tx((c) => createOrderCheckout(c, id, auth.userId, b.returnUrl));
  });

  app.get('/orders/:id/tracking', async (req) => {
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const viewer = await viewerFor(req, id);
    const o = await loadOrder(pool, id, viewer);
    const d = o.delivery;
    const path = d && d.captain
      ? (await q(pool, `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM (SELECT location, recorded_at FROM delivery_tracks WHERE delivery_id = $1 ORDER BY recorded_at DESC LIMIT 200) t ORDER BY recorded_at`, [d.id]))
          .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      : [];
    return {
      orderId: o.id, orderStatus: o.status, deliveryStatus: d?.status ?? null, pickup: d?.pickup.location ?? null, dropoff: d?.dropoff.location ?? null,
      captain: d?.captain ?? null, etaPickupAt: d?.etaPickupAt ?? null, etaDropoffAt: d?.etaDropoffAt ?? null, path,
    };
  });

  app.post('/orders/:id/rating', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const r = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() });
    const b = parse(z.object({ captain: r.optional(), merchant: r.optional() }).refine((x) => x.captain || x.merchant, { message: 'Rate the captain or the merchant' }), req.body);
    await tx(async (c) => {
      const o = await one(c, `SELECT o.*, d.captain_id FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.id = $1 AND o.customer_user_id = $2`, [id, auth.userId]);
      if (!o) throw notFound('Order');
      if (!['delivered', 'completed'].includes(o.status)) throw conflict('You can rate an order after it is delivered', 'not_delivered');
      const targets: [string, string | null, { score: number; comment?: string } | undefined, string][] = [
        ['captain', o.captain_id, b.captain, 'captains'], ['merchant', o.merchant_id, b.merchant, 'merchants'],
      ];
      for (const [type, targetId, rating, table] of targets) {
        if (!rating || !targetId) continue;
        const ins = await q(c, `INSERT INTO ratings (order_id, rater_user_id, target_type, target_id, score, comment) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (order_id, target_type) DO NOTHING RETURNING id`, [
          id, auth.userId, type, targetId, rating.score, rating.comment ?? null,
        ]);
        if (ins.length) await q(c, `UPDATE ${table} SET rating_avg = (SELECT AVG(score) FROM ratings WHERE target_type = $2 AND target_id = $1), rating_count = rating_count + 1 WHERE id = $1`, [targetId, type]);
      }
    });
    reply.code(204);
  });

  // ─────────── Merchant portal: orders & deliveries ───────────
  app.get('/merchants/:merchantId/orders', async (req) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.orders:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), type: z.enum(['marketplace', 'merchant_delivery', 'c2c']).optional() }), req.query);
    const params: unknown[] = [merchantId];
    let where = 'o.merchant_id = $1';
    if (f.status) {
      const statuses = f.status === 'active' ? ACTIVE_ORDER_STATUSES.filter((s) => s !== 'pending_payment') : f.status.split(',');
      params.push(statuses);
      where += ` AND o.status = ANY($${params.length})`;
    } else where += ` AND o.status <> 'pending_payment'`;
    if (f.type) { params.push(f.type); where += ` AND o.type = $${params.length}`; }
    const rows = await q(pool, `SELECT o.*, m.slug AS m_slug, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.logo_url AS m_logo, m.contact_phone AS m_phone
      FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE ${where} ORDER BY o.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM orders o WHERE ${where}`, params);
    return { items: await Promise.all(rows.map((o) => orderDto(pool, o, 'merchant', { withTimeline: false }))), total: total.n, limit: f.limit, offset: f.offset };
  });

  app.post('/merchants/:merchantId/orders/:id/:action', async (req) => {
    const { merchantId, id, action } = parse(z.object({ merchantId: zUuid, id: zUuid, action: z.enum(['accept', 'reject', 'preparing', 'ready', 'cancel']) }), req.params);
    const auth = requireMerchantPerm(req, merchantId, 'merchant.orders:process');
    const b = parse(z.object({ prepTimeMinutes: z.number().int().min(0).max(240).optional(), reason: z.string().max(300).optional() }), req.body);
    await tx((c) => merchantOrderAction(c, merchantId, id, action, auth.userId, b));
    return loadOrder(pool, id, 'merchant');
  });

  app.post('/merchants/:merchantId/deliveries', async (req, reply) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    const auth = requireMerchantPerm(req, merchantId, 'merchant.deliveries:create');
    const b = parse(z.object({
      dropoff: zPlace, pickup: zPlace.optional(), codAmountBaisa: z.number().int().min(0).optional(), packageDescription: z.string().max(300).optional(),
      packageSize: z.enum(['small', 'medium', 'large']).optional(), vehicleType: z.enum(['bike', 'car', 'van']).optional(), notes: z.string().max(500).optional(),
    }), req.body);
    if (b.dropoff.addressId) throw badRequest('Saved addresses belong to consumers; send a location for the customer');
    const id = await tx((c) => createMerchantDelivery(c, auth.userId, merchantId, b, idemKey(req.headers['idempotency-key'])));
    reply.code(201);
    return loadOrder(pool, id, 'merchant');
  });

  // Merchant can view a single order through the generic route as well; this guards cross-merchant access explicitly.
  app.get('/merchants/:merchantId/orders/:id', async (req) => {
    const { merchantId, id } = parse(z.object({ merchantId: zUuid, id: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.orders:read');
    const o = await loadOrderRow(pool, id);
    if (o.merchant_id !== merchantId) throw forbidden();
    return orderDto(pool, o, 'merchant');
  });
}
