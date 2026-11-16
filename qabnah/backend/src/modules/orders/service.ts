import type pg from 'pg';
import { one, q, type Queryable } from '../../db/pool.js';
import { randomDigits } from '../../lib/crypto.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import type { LatLng } from '../../lib/geo.js';
import { applyBps, vatIncluded } from '../../lib/money.js';
import { normalizeOmanPhone } from '../../lib/phone.js';
import { publish } from '../../realtime/bus.js';
import { quoteDelivery, type Vehicle } from '../core/pricing.js';
import { getSettings } from '../core/settings.js';
import { assertOrderTransition, PRE_PICKUP_STATUSES } from '../core/state.js';
import { loadProducts, validateOptions } from '../catalog/service.js';
import { effectiveCommissionBps, getMerchant, merchantIsOpen, merchantUserIds } from '../merchants/service.js';
import { merchantWhatsApp, notify, notifyMany } from '../notifications/service.js';
import { addressText } from '../users/routes.js';
import { cancelDeliveryForOrder, startDispatch } from '../dispatch/service.js';
import { refundOrderPayments } from '../payments/service.js';
import { orderChannels } from './dto.js';

const STATUS_TS: Record<string, string> = {
  placed: 'placed_at', accepted: 'accepted_at', ready_for_pickup: 'ready_at', delivered: 'delivered_at',
  completed: 'completed_at', cancelled: 'cancelled_at', rejected: 'cancelled_at',
};

export interface PlaceInput { location?: LatLng; addressId?: string; address?: string; contactName?: string; contactPhone?: string; notes?: string }
export interface CartItemInput { productId: string; quantity: number; optionIds?: string[]; notes?: string }

/** Resolve a dropoff/pickup place from a saved address or raw input. */
export async function resolvePlace(db: Queryable, userId: string | null, p: PlaceInput, fallback: { name?: string | null; phone?: string | null } = {}) {
  if (p.addressId) {
    const a = await one(db, `SELECT a.*, ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng FROM addresses a WHERE a.id = $1 AND a.user_id = $2`, [p.addressId, userId]);
    if (!a) throw notFound('Address');
    return {
      location: { lat: Number(a.lat), lng: Number(a.lng) },
      address: addressText(a),
      contactName: a.contact_name ?? fallback.name ?? null,
      contactPhone: a.contact_phone ?? fallback.phone ?? null,
      notes: p.notes ?? a.landmark ?? null,
    };
  }
  if (!p.location) throw badRequest('A location or addressId is required');
  return {
    location: p.location,
    address: p.address ?? '',
    contactName: p.contactName ?? fallback.name ?? null,
    contactPhone: p.contactPhone ? normalizeOmanPhone(p.contactPhone) : fallback.phone ?? null,
    notes: p.notes ?? null,
  };
}

export async function priceCart(db: Queryable, userId: string | null, input: { merchantId: string; items: CartItemInput[]; addressId?: string; dropoff?: PlaceInput }) {
  const m = await getMerchant(db, input.merchantId);
  if (m.status !== 'active') throw unprocessable('merchant_unavailable', 'This store is not available');
  if (!merchantIsOpen(m)) throw unprocessable('merchant_closed', 'This store is closed right now');
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await loadProducts(db, 'p.id = ANY($1) AND p.merchant_id = $2', [ids, m.id]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = input.items.map((it) => {
    const p = byId.get(it.productId);
    if (!p) throw unprocessable('invalid_item', 'A product in your cart is no longer available');
    if (!p.isAvailable) throw unprocessable('item_unavailable', `${p.nameEn} is not available`, { productId: p.id });
    if (p.trackStock && p.stockQty < it.quantity) throw unprocessable('out_of_stock', `Only ${p.stockQty} left of ${p.nameEn}`, { productId: p.id });
    const v = validateOptions(p, it.optionIds ?? []);
    if (!v.ok) throw unprocessable('invalid_options', `${p.nameEn}: ${v.error}`, { productId: p.id });
    const unit = p.basePriceBaisa + v.selected.reduce((s, o) => s + o.priceDeltaBaisa, 0);
    if (unit < 0) throw unprocessable('invalid_options', 'Invalid price');
    return {
      productId: p.id, nameEn: p.nameEn, nameAr: p.nameAr, quantity: it.quantity, unitPriceBaisa: unit, lineTotalBaisa: unit * it.quantity, notes: it.notes ?? null,
      options: v.selected.map((s) => ({ id: s.id, groupNameEn: s.groupNameEn, groupNameAr: s.groupNameAr, nameEn: s.nameEn, nameAr: s.nameAr, priceDeltaBaisa: s.priceDeltaBaisa })),
      trackStock: p.trackStock,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalBaisa, 0);
  if (subtotal < m.min_order_baisa) throw unprocessable('below_minimum', `Minimum order is ${m.min_order_baisa} baisa`, { minOrderBaisa: m.min_order_baisa });
  const place = await resolvePlace(db, userId, { ...(input.dropoff ?? {}), addressId: input.addressId ?? input.dropoff?.addressId });
  const merchantLoc = { lat: Number(m.loc_lat), lng: Number(m.loc_lng) };
  const quote = await quoteDelivery(db, { type: 'marketplace', pickup: merchantLoc, dropoff: place.location });
  const settings = await getSettings(db);
  const vatBps = settings.vatRateBps;
  const serviceFee = settings.serviceFeeBaisa;
  const goodsVat = m.prices_include_vat ? vatIncluded(subtotal, vatBps) : applyBps(subtotal, vatBps);
  const addedVat = m.prices_include_vat ? 0 : goodsVat;
  const total = subtotal + addedVat + quote.feeBaisa + serviceFee;
  return {
    merchant: m,
    place,
    quote,
    lines,
    breakdown: {
      subtotalBaisa: subtotal,
      deliveryFeeBaisa: quote.feeBaisa,
      serviceFeeBaisa: serviceFee,
      discountBaisa: 0,
      vatBaisa: goodsVat + vatIncluded(quote.feeBaisa + serviceFee, vatBps),
      vatIncluded: !!m.prices_include_vat,
      totalBaisa: total,
      distanceM: quote.distanceM,
      estimatedDurationS: quote.estimatedDurationS + m.prep_time_minutes * 60,
      currency: 'OMR' as const,
      lines: lines.map(({ trackStock, ...l }) => l),
    },
    commissionBaisa: applyBps(subtotal, effectiveCommissionBps(m, settings.defaultCommissionBps)),
  };
}

async function findIdempotent(db: Queryable, userId: string, key?: string) {
  if (!key) return null;
  return one(db, `SELECT id FROM orders WHERE created_by = $1 AND idempotency_key = $2`, [userId, key]);
}

interface DeliveryInsert {
  orderId: string; zoneId: string | null; vehicleType: Vehicle | null;
  pickup: { location: LatLng; address: string; contactName: string | null; contactPhone: string | null; notes: string | null };
  dropoff: { location: LatLng; address: string; contactName: string | null; contactPhone: string | null; notes: string | null };
  distanceM: number; durationS: number; feeBaisa: number; captainEarningBaisa: number; codAmountBaisa: number;
  packageSize?: string | null; packageDescription?: string | null; declaredValueBaisa?: number | null;
}

export async function insertDelivery(c: Queryable, d: DeliveryInsert) {
  return one(
    c,
    `INSERT INTO deliveries (order_id, zone_id, vehicle_type, pickup_location, pickup_address, pickup_contact_name, pickup_contact_phone, pickup_notes,
       dropoff_location, dropoff_address, dropoff_contact_name, dropoff_contact_phone, dropoff_notes, distance_m, estimated_duration_s, fee_baisa,
       captain_earning_baisa, cod_amount_baisa, package_size, package_description, declared_value_baisa, delivery_pin)
     VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography, $6,$7,$8,$9, ST_SetSRID(ST_MakePoint($10,$11),4326)::geography, $12,$13,$14,$15,
       $16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
    [
      d.orderId, d.zoneId, d.vehicleType, d.pickup.location.lng, d.pickup.location.lat, d.pickup.address, d.pickup.contactName, d.pickup.contactPhone, d.pickup.notes,
      d.dropoff.location.lng, d.dropoff.location.lat, d.dropoff.address, d.dropoff.contactName, d.dropoff.contactPhone, d.dropoff.notes, d.distanceM, d.durationS,
      d.feeBaisa, d.captainEarningBaisa, d.codAmountBaisa, d.packageSize ?? null, d.packageDescription ?? null, d.declaredValueBaisa ?? null, randomDigits(4),
    ],
  );
}

async function history(c: Queryable, orderId: string, from: string | null, to: string, actor: string | null, note?: string | null) {
  await q(c, `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id, note) VALUES ($1,$2,$3,$4,$5)`, [orderId, from, to, actor, note ?? null]);
}

export async function createMarketplaceOrder(c: pg.PoolClient, userId: string, input: {
  merchantId: string; items: CartItemInput[]; addressId?: string; dropoff?: PlaceInput; paymentMethod: 'online' | 'cod'; notes?: string; source?: 'app' | 'storefront';
}, idempotencyKey?: string) {
  const existing = await findIdempotent(c, userId, idempotencyKey);
  if (existing) return existing.id as string;
  const user = await one(c, `SELECT full_name, phone FROM users WHERE id = $1`, [userId]);
  const priced = await priceCart(c, userId, input);
  const m = priced.merchant;
  if (input.paymentMethod === 'cod' && !m.accepts_cod) throw unprocessable('payment_method_unavailable', 'This store does not accept cash on delivery');
  if (input.paymentMethod === 'online' && !m.accepts_online) throw unprocessable('payment_method_unavailable', 'This store does not accept online payment');
  const settings = await getSettings(c);
  const b = priced.breakdown;
  if (input.paymentMethod === 'cod' && b.totalBaisa > settings.codMaxBaisa) throw unprocessable('cod_limit', 'This order is above the cash-on-delivery limit; please pay online');
  const status = input.paymentMethod === 'online' ? 'pending_payment' : 'placed';
  const o = await one(
    c,
    `INSERT INTO orders (type, source, merchant_id, customer_user_id, customer_name, customer_phone, status, payment_method, subtotal_baisa, delivery_fee_baisa,
       service_fee_baisa, discount_baisa, vat_baisa, total_baisa, cod_amount_baisa, commission_baisa, notes, prep_time_minutes, idempotency_key, created_by, placed_at)
     VALUES ('marketplace',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15,$16,$17,$3, CASE WHEN $6 = 'placed' THEN now() END) RETURNING *`,
    [
      input.source ?? 'app', m.id, userId, priced.place.contactName ?? user.full_name, priced.place.contactPhone ?? user.phone, status, input.paymentMethod,
      b.subtotalBaisa, b.deliveryFeeBaisa, b.serviceFeeBaisa, b.vatBaisa, b.totalBaisa, input.paymentMethod === 'cod' ? b.totalBaisa : 0, priced.commissionBaisa,
      input.notes ?? null, m.prep_time_minutes, idempotencyKey ?? null,
    ],
  );
  for (const l of priced.lines) {
    await q(c, `INSERT INTO order_items (order_id, product_id, name_en, name_ar, unit_price_baisa, quantity, options, line_total_baisa, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      o.id, l.productId, l.nameEn, l.nameAr, l.unitPriceBaisa, l.quantity, JSON.stringify(l.options), l.lineTotalBaisa, l.notes,
    ]);
    if (l.trackStock) {
      const r = await q(c, `UPDATE products SET stock_qty = stock_qty - $2 WHERE id = $1 AND stock_qty >= $2 RETURNING id`, [l.productId, l.quantity]);
      if (!r.length) throw conflict(`${l.nameEn} just sold out`, 'out_of_stock');
    }
  }
  await insertDelivery(c, {
    orderId: o.id, zoneId: priced.quote.zoneId, vehicleType: null,
    pickup: { location: { lat: Number(m.loc_lat), lng: Number(m.loc_lng) }, address: m.address_text, contactName: m.name_en, contactPhone: m.contact_phone, notes: null },
    dropoff: { ...priced.place, contactName: priced.place.contactName ?? user.full_name, contactPhone: priced.place.contactPhone ?? user.phone },
    distanceM: priced.quote.distanceM, durationS: priced.quote.estimatedDurationS, feeBaisa: priced.quote.feeBaisa,
    captainEarningBaisa: priced.quote.captainEarningBaisa, codAmountBaisa: o.cod_amount_baisa,
  });
  await history(c, o.id, null, status, userId);
  if (status === 'placed') await onOrderPlaced(c, o.id, userId);
  return o.id as string;
}

export async function createShipment(c: pg.PoolClient, userId: string, input: {
  pickup: PlaceInput; dropoff: PlaceInput; package: { size: 'small' | 'medium' | 'large'; description: string; declaredValueBaisa?: number };
  vehicleType?: Vehicle; paymentMethod: 'online' | 'cod'; codPayer?: 'sender' | 'recipient'; notes?: string;
}, idempotencyKey?: string) {
  const existing = await findIdempotent(c, userId, idempotencyKey);
  if (existing) return existing.id as string;
  if (input.paymentMethod === 'cod' && !input.codPayer) throw badRequest('codPayer is required for cash payment');
  const user = await one(c, `SELECT full_name, phone FROM users WHERE id = $1`, [userId]);
  const pickup = await resolvePlace(c, userId, input.pickup, { name: user.full_name, phone: user.phone });
  const dropoff = await resolvePlace(c, userId, input.dropoff);
  if (!dropoff.contactPhone) throw badRequest("The recipient's phone number is required");
  const vehicle = input.vehicleType ?? (input.package.size === 'large' ? 'car' : null);
  const quote = await quoteDelivery(c, { type: 'c2c', pickup: pickup.location, dropoff: dropoff.location, vehicleType: vehicle });
  const settings = await getSettings(c);
  const status = input.paymentMethod === 'online' ? 'pending_payment' : 'placed';
  const o = await one(
    c,
    `INSERT INTO orders (type, source, customer_user_id, customer_name, customer_phone, status, payment_method, cod_payer, delivery_fee_baisa, vat_baisa, total_baisa,
       cod_amount_baisa, notes, idempotency_key, created_by, placed_at)
     VALUES ('c2c','app',$1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10,$11,$1, CASE WHEN $4 = 'placed' THEN now() END) RETURNING *`,
    [userId, user.full_name, user.phone, status, input.paymentMethod, input.codPayer ?? null, quote.feeBaisa, vatIncluded(quote.feeBaisa, settings.vatRateBps),
      input.paymentMethod === 'cod' ? quote.feeBaisa : 0, input.notes ?? null, idempotencyKey ?? null],
  );
  await insertDelivery(c, {
    orderId: o.id, zoneId: quote.zoneId, vehicleType: vehicle, pickup, dropoff, distanceM: quote.distanceM, durationS: quote.estimatedDurationS,
    feeBaisa: quote.feeBaisa, captainEarningBaisa: quote.captainEarningBaisa, codAmountBaisa: o.cod_amount_baisa,
    packageSize: input.package.size, packageDescription: input.package.description, declaredValueBaisa: input.package.declaredValueBaisa ?? null,
  });
  await history(c, o.id, null, status, userId);
  if (status === 'placed') await onOrderPlaced(c, o.id, userId);
  return o.id as string;
}

export async function createMerchantDelivery(c: pg.PoolClient, userId: string | null, merchantId: string, input: {
  dropoff: PlaceInput; pickup?: PlaceInput; codAmountBaisa?: number; packageDescription?: string; packageSize?: 'small' | 'medium' | 'large';
  vehicleType?: Vehicle; notes?: string; source?: 'portal' | 'payment_link'; prepaidOnlineBaisa?: number; commissionBaisa?: number;
}, idempotencyKey?: string) {
  if (userId) {
    const existing = await findIdempotent(c, userId, idempotencyKey);
    if (existing) return existing.id as string;
  }
  const m = await getMerchant(c, merchantId);
  if (m.status !== 'active') throw unprocessable('merchant_unavailable', 'Store must be approved before booking deliveries');
  const settings = await getSettings(c);
  const cod = input.codAmountBaisa ?? 0;
  if (cod > settings.codMaxBaisa) throw unprocessable('cod_limit', 'Cash amount exceeds the per-order limit');
  const pickup = input.pickup
    ? await resolvePlace(c, null, input.pickup, { name: m.name_en, phone: m.contact_phone })
    : { location: { lat: Number(m.loc_lat), lng: Number(m.loc_lng) }, address: m.address_text, contactName: m.name_en, contactPhone: m.contact_phone, notes: null };
  const dropoff = await resolvePlace(c, null, input.dropoff);
  if (!dropoff.contactPhone) throw badRequest("The customer's phone number is required");
  const quote = await quoteDelivery(c, { type: 'merchant_delivery', pickup: pickup.location, dropoff: dropoff.location, vehicleType: input.vehicleType ?? null });
  const prepaid = input.prepaidOnlineBaisa ?? 0;
  const paymentMethod = prepaid > 0 ? 'online' : cod > 0 ? 'cod' : 'prepaid';
  const o = await one(
    c,
    `INSERT INTO orders (type, source, merchant_id, customer_name, customer_phone, status, payment_method, payment_status, subtotal_baisa, delivery_fee_baisa,
       vat_baisa, total_baisa, cod_amount_baisa, commission_baisa, notes, idempotency_key, created_by, placed_at)
     VALUES ('merchant_delivery',$1,$2,$3,$4,'placed',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()) RETURNING *`,
    [input.source ?? 'portal', merchantId, dropoff.contactName, dropoff.contactPhone, paymentMethod, prepaid > 0 ? 'paid' : 'unpaid', prepaid || cod, quote.feeBaisa,
      vatIncluded(quote.feeBaisa, settings.vatRateBps), prepaid || cod, cod, input.commissionBaisa ?? 0, input.notes ?? null, idempotencyKey ?? null, userId],
  );
  await insertDelivery(c, {
    orderId: o.id, zoneId: quote.zoneId, vehicleType: input.vehicleType ?? null, pickup, dropoff, distanceM: quote.distanceM, durationS: quote.estimatedDurationS,
    feeBaisa: quote.feeBaisa, captainEarningBaisa: quote.captainEarningBaisa, codAmountBaisa: cod,
    packageSize: input.packageSize ?? 'small', packageDescription: input.packageDescription ?? null,
  });
  await history(c, o.id, null, 'placed', userId);
  await onOrderPlaced(c, o.id, userId);
  return o.id as string;
}

/** Move an order to a new status (row lock, transition check, history, realtime). */
export async function transitionOrder(c: Queryable, orderId: string, to: string, actor: string | null, note?: string | null, extra: Record<string, unknown> = {}) {
  const o = await one(c, `SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!o) throw notFound('Order');
  if (o.status === to) return o;
  assertOrderTransition(o.status, to);
  const sets = ['status = $2', 'updated_at = now()'];
  const params: unknown[] = [orderId, to];
  if (STATUS_TS[to]) sets.push(`${STATUS_TS[to]} = COALESCE(${STATUS_TS[to]}, now())`);
  for (const [k, v] of Object.entries(extra)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  const updated = await one(c, `UPDATE orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  await history(c, orderId, o.status, to, actor, note);
  const d = await one(c, `SELECT id FROM deliveries WHERE order_id = $1`, [orderId]);
  await publish(c, orderChannels(updated, d?.id), 'order.status_changed', { orderId, number: updated.number, from: o.status, to, at: new Date().toISOString() });
  return updated;
}

/** Side effects once an order is placed (paid or COD). */
export async function onOrderPlaced(c: Queryable, orderId: string, actor: string | null) {
  const o = await one(c, `SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (o.type === 'marketplace') {
    await publish(c, [`merchant:${o.merchant_id}`, 'admin:ops'], 'order.created', { orderId, number: o.number, totalBaisa: o.total_baisa });
    await notifyMany(c, await merchantUserIds(c, o.merchant_id), 'order.placed.merchant', { number: o.number, orderId });
    await merchantWhatsApp(c, orderId, 'order.placed');
  } else {
    await transitionOrder(c, orderId, 'ready_for_pickup', actor, 'auto: ready for courier');
    if (o.merchant_id) await publish(c, [`merchant:${o.merchant_id}`], 'order.created', { orderId, number: o.number });
    const d = await one(c, `SELECT id FROM deliveries WHERE order_id = $1`, [orderId]);
    await startDispatch(c, d.id);
  }
}

export async function merchantOrderAction(c: pg.PoolClient, merchantId: string, orderId: string, action: string, actor: string, body: { prepTimeMinutes?: number; reason?: string }) {
  const o = await one(c, `SELECT o.*, m.name_ar, m.name_en FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1 AND o.merchant_id = $2`, [orderId, merchantId]);
  if (!o) throw notFound('Order');
  const delivery = await one(c, `SELECT d.id, d.status, r.dispatch_on_accept FROM deliveries d LEFT JOIN LATERAL (
      SELECT dispatch_on_accept FROM dispatch_rules WHERE zone_id = d.zone_id OR zone_id IS NULL ORDER BY zone_id NULLS LAST LIMIT 1) r ON true WHERE d.order_id = $1`, [orderId]);
  switch (action) {
    case 'accept': {
      if (o.type !== 'marketplace') throw conflict('Only marketplace orders need acceptance', 'invalid_transition');
      await transitionOrder(c, orderId, 'accepted', actor, null, { prep_time_minutes: body.prepTimeMinutes ?? o.prep_time_minutes });
      if (o.customer_user_id) await notify(c, o.customer_user_id, 'order.accepted', { number: o.number, merchant: o.name_ar, orderId });
      await merchantWhatsApp(c, orderId, 'order.accepted');
      if (delivery?.dispatch_on_accept !== false && delivery?.status === 'created') await startDispatch(c, delivery.id);
      break;
    }
    case 'preparing':
      await transitionOrder(c, orderId, 'preparing', actor);
      break;
    case 'ready': {
      await transitionOrder(c, orderId, 'ready_for_pickup', actor);
      if (delivery?.status === 'created') await startDispatch(c, delivery.id);
      break;
    }
    case 'reject': {
      if (!body.reason) throw badRequest('A reason is required');
      await cancelOrder(c, orderId, actor, body.reason, 'rejected');
      break;
    }
    case 'cancel': {
      if (!body.reason) throw badRequest('A reason is required');
      await cancelOrder(c, orderId, actor, body.reason);
      break;
    }
    default:
      throw badRequest('Unknown action');
  }
}

/** Cancel (or reject) an order: stops delivery before pickup, restocks items, refunds online payments. */
export async function cancelOrder(c: Queryable, orderId: string, actor: string | null, reason: string, to: 'cancelled' | 'rejected' = 'cancelled') {
  const o = await one(c, `SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!o) throw notFound('Order');
  const d = await one(c, `SELECT id, status FROM deliveries WHERE order_id = $1 FOR UPDATE`, [orderId]);
  if (d && !PRE_PICKUP_STATUSES.includes(d.status) && d.status !== 'failed') throw conflict('The order has already been picked up', 'already_picked_up');
  await transitionOrder(c, orderId, to, actor, reason, { cancel_reason: reason, cancelled_by: actor });
  if (d && PRE_PICKUP_STATUSES.includes(d.status)) await cancelDeliveryForOrder(c, d.id, actor, reason);
  const items = await q(c, `SELECT oi.product_id, oi.quantity FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 AND p.track_stock`, [orderId]);
  for (const i of items) await q(c, `UPDATE products SET stock_qty = stock_qty + $2 WHERE id = $1`, [i.product_id, i.quantity]);
  if (o.payment_status === 'paid' && o.payment_method === 'online') await refundOrderPayments(c, orderId, reason, actor);
  if (o.customer_user_id && o.customer_user_id !== actor) await notify(c, o.customer_user_id, to === 'rejected' ? 'order.rejected' : 'order.cancelled', { number: o.number, orderId });
}
