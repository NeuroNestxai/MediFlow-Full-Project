import { one, q, type Queryable } from '../../db/pool.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { estimateRoute, type LatLng } from '../../lib/geo.js';
import { safeEqual } from '../../lib/crypto.js';
import { publish } from '../../realtime/bus.js';
import { captainNextActions } from '../core/state.js';
import { postDeliveryCompleted } from '../finance/ledger.js';
import { merchantWhatsApp, notify, notifyMany, staffUserIdsWithPerm } from '../notifications/service.js';
import { DELIVERY_SELECT, deliveryDto } from '../orders/dto.js';
import { transitionOrder } from '../orders/service.js';
import { releaseDelivery, setDeliveryStatus } from '../dispatch/service.js';

export async function captainDeliveryDto(db: Queryable, deliveryId: string) {
  const d = await one(db, `${DELIVERY_SELECT} WHERE d.id = $1`, [deliveryId]);
  if (!d) throw notFound('Delivery');
  const o = await one(
    db,
    `SELECT o.id, o.number, o.type, o.status, o.customer_name, m.name_en AS merchant_name, (SELECT COALESCE(SUM(quantity),0)::int FROM order_items WHERE order_id = o.id) AS items_count
       FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
    [d.order_id],
  );
  return {
    ...deliveryDto(d, 'captain'),
    orderId: o.id,
    orderNumber: o.number,
    orderType: o.type,
    orderStatus: o.status,
    merchantName: o.merchant_name,
    itemsCount: o.items_count,
    earningBaisa: d.captain_earning_baisa,
    nextActions: captainNextActions(d.status),
  };
}

async function lockOwnDelivery(db: Queryable, deliveryId: string, captainId: string) {
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [deliveryId]);
  if (!d || d.captain_id !== captainId) throw notFound('Delivery');
  return d;
}

export async function captainAction(db: Queryable, captainId: string, userId: string, deliveryId: string, action: string, body: { reason?: string; location?: LatLng }) {
  const d = await lockOwnDelivery(db, deliveryId, captainId);
  if (!captainNextActions(d.status).includes(action)) throw conflict(`Action ${action} is not allowed while ${d.status}`, 'invalid_transition');
  const data = body.location ? { location: body.location } : {};
  switch (action) {
    case 'arrive_pickup':
      await setDeliveryStatus(db, d, 'at_pickup', userId, data);
      break;
    case 'pickup': {
      const route = await one(db, `SELECT ST_Y(dropoff_location::geometry) AS lat, ST_X(dropoff_location::geometry) AS lng, ST_Y(pickup_location::geometry) AS plat, ST_X(pickup_location::geometry) AS plng FROM deliveries WHERE id = $1`, [d.id]);
      const from = body.location ?? { lat: Number(route.plat), lng: Number(route.plng) };
      const eta = estimateRoute(from, { lat: Number(route.lat), lng: Number(route.lng) }, null).durationS;
      await setDeliveryStatus(db, d, 'picked_up', userId, data, [`eta_dropoff_at = now() + make_interval(secs => $3::int)`], [eta]);
      await transitionOrder(db, d.order_id, 'out_for_delivery', userId);
      const o = await one(db, `SELECT number, customer_user_id FROM orders WHERE id = $1`, [d.order_id]);
      if (o.customer_user_id) await notify(db, o.customer_user_id, 'delivery.picked_up', { number: o.number, orderId: d.order_id });
      await merchantWhatsApp(db, d.order_id, 'delivery.picked_up');
      break;
    }
    case 'arrive_dropoff':
      await setDeliveryStatus(db, d, 'at_dropoff', userId, data);
      break;
    case 'fail': {
      if (!body.reason) throw badRequest('A reason is required');
      await setDeliveryStatus(db, d, 'failed', userId, { ...data, reason: body.reason }, ['failure_reason = $3'], [body.reason]);
      await transitionOrder(db, d.order_id, 'cancelled', userId, `delivery failed: ${body.reason}`, { cancel_reason: `delivery_failed: ${body.reason}` });
      const o = await one(db, `SELECT number, customer_user_id FROM orders WHERE id = $1`, [d.order_id]);
      if (o.customer_user_id) await notify(db, o.customer_user_id, 'delivery.failed', { number: o.number, orderId: d.order_id });
      await notifyMany(db, await staffUserIdsWithPerm(db, 'deliveries:dispatch'), 'delivery.failed', { number: o.number, orderId: d.order_id });
      break;
    }
    case 'release':
      if (!body.reason) throw badRequest('A reason is required');
      await releaseDelivery(db, d, userId, body.reason);
      break;
    default:
      throw badRequest('Unknown action');
  }
}

export async function completeDelivery(db: Queryable, captainId: string, userId: string, deliveryId: string, body: {
  pin?: string; photoFileId?: string; recipientName?: string; codCollectedBaisa?: number; note?: string; location?: LatLng;
}) {
  const d = await lockOwnDelivery(db, deliveryId, captainId);
  if (!['picked_up', 'at_dropoff'].includes(d.status)) throw conflict('Pick up the order before completing it', 'invalid_transition');
  let pinVerified = false;
  if (body.pin) {
    if (!safeEqual(body.pin, d.delivery_pin)) throw unprocessable('wrong_pin', 'The delivery code is incorrect');
    pinVerified = true;
  } else if (d.pin_required && !body.photoFileId) {
    throw unprocessable('proof_required', 'Enter the delivery code from the recipient, or attach a photo');
  }
  if (body.photoFileId) {
    const f = await one(db, `SELECT 1 FROM files WHERE id = $1 AND owner_user_id = $2 AND purpose = 'proof_of_delivery'`, [body.photoFileId, userId]);
    if (!f) throw badRequest('Upload the photo with purpose proof_of_delivery first');
  }
  const codCollected = body.codCollectedBaisa ?? d.cod_amount_baisa;
  if (codCollected !== d.cod_amount_baisa) throw unprocessable('cod_mismatch', `Collect exactly ${d.cod_amount_baisa} baisa, or report a problem`, { expected: d.cod_amount_baisa });
  await q(
    db,
    `INSERT INTO proofs_of_delivery (delivery_id, photo_file_id, recipient_name, pin_verified, cod_collected_baisa, note, location)
     VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7,$8),4326)::geography END)`,
    [d.id, body.photoFileId ?? null, body.recipientName ?? null, pinVerified, codCollected, body.note ?? null, body.location?.lng ?? null, body.location?.lat ?? null],
  );
  await setDeliveryStatus(db, d, 'delivered', userId, { pinVerified, photo: !!body.photoFileId });
  const order = await one(db, `SELECT * FROM orders WHERE id = $1`, [d.order_id]);
  await transitionOrder(db, d.order_id, 'delivered', userId, null, order.payment_method === 'cod' ? { payment_status: 'paid' } : {});
  await postDeliveryCompleted(db, d.order_id, d.id);
  if (order.customer_user_id) await notify(db, order.customer_user_id, 'delivery.delivered', { number: order.number, orderId: order.id });
  await merchantWhatsApp(db, d.order_id, 'delivery.delivered');
}

/** Store a captain location ping; fan out to active deliveries' trackers. */
export async function recordLocation(db: Queryable, captainId: string, p: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number }) {
  await q(
    db,
    `INSERT INTO captain_locations (captain_id, location, heading, speed_mps, accuracy_m, updated_at) VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4,$5,$6, now())
     ON CONFLICT (captain_id) DO UPDATE SET location = EXCLUDED.location, heading = EXCLUDED.heading, speed_mps = EXCLUDED.speed_mps, accuracy_m = EXCLUDED.accuracy_m, updated_at = now()`,
    [captainId, p.lng, p.lat, p.heading ?? null, p.speed ?? null, p.accuracy ?? null],
  );
  const active = await q(
    db,
    `SELECT d.id, d.order_id, d.status, o.merchant_id, ST_Y(d.dropoff_location::geometry) AS do_lat, ST_X(d.dropoff_location::geometry) AS do_lng,
            ST_Y(d.pickup_location::geometry) AS pu_lat, ST_X(d.pickup_location::geometry) AS pu_lng, c.vehicle_type
       FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN captains c ON c.id = d.captain_id
      WHERE d.captain_id = $1 AND d.status IN ('assigned','at_pickup','picked_up','at_dropoff')`,
    [captainId],
  );
  for (const d of active) {
    await q(db, `INSERT INTO delivery_tracks (delivery_id, captain_id, location) VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography)`, [d.id, captainId, p.lng, p.lat]);
    const toDrop = ['picked_up', 'at_dropoff'].includes(d.status);
    const target = toDrop ? { lat: Number(d.do_lat), lng: Number(d.do_lng) } : { lat: Number(d.pu_lat), lng: Number(d.pu_lng) };
    const eta = estimateRoute(p, target, d.vehicle_type).durationS;
    const upd = await one(
      db,
      toDrop
        ? `UPDATE deliveries SET eta_dropoff_at = now() + make_interval(secs => $2::int) WHERE id = $1 RETURNING eta_pickup_at, eta_dropoff_at`
        : `UPDATE deliveries SET eta_pickup_at = now() + make_interval(secs => $2::int), eta_dropoff_at = now() + make_interval(secs => $2::int + estimated_duration_s) WHERE id = $1 RETURNING eta_pickup_at, eta_dropoff_at`,
      [d.id, eta],
    );
    await publish(db, [`order:${d.order_id}`, `delivery:${d.id}`, ...(d.merchant_id ? [`merchant:${d.merchant_id}`] : [])], 'delivery.location', {
      deliveryId: d.id, orderId: d.order_id, lat: p.lat, lng: p.lng, heading: p.heading ?? null, etaPickupAt: upd.eta_pickup_at, etaDropoffAt: upd.eta_dropoff_at,
    });
  }
  await publish(db, ['admin:ops'], 'captain.location', { captainId, lat: p.lat, lng: p.lng, activeDeliveries: active.length });
}
