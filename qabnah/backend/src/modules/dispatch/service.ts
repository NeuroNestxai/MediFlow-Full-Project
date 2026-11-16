import { one, q, type Queryable } from '../../db/pool.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { estimateRoute, rowPoint } from '../../lib/geo.js';
import { formatOMR } from '../../lib/money.js';
import { publish } from '../../realtime/bus.js';
import { getSettings } from '../core/settings.js';
import { assertDeliveryTransition, ACTIVE_DELIVERY_STATUSES } from '../core/state.js';
import { inBlackout, muscatNow, type BlackoutWindow } from '../core/time.js';
import { notify } from '../notifications/service.js';

export interface DispatchRule {
  strategy: 'sequential' | 'broadcast' | 'manual';
  auto_dispatch: boolean;
  dispatch_on_accept: boolean;
  search_radius_km: number;
  radius_step_km: number;
  max_radius_km: number;
  max_rounds: number;
  broadcast_size: number;
  offer_timeout_s: number;
  location_max_age_s: number;
  respect_schedule: boolean;
  bike_blackout: BlackoutWindow[];
  weight_distance: number;
  weight_rating: number;
  weight_acceptance: number;
}

const FALLBACK_RULE: DispatchRule = {
  strategy: 'sequential', auto_dispatch: true, dispatch_on_accept: true, search_radius_km: 3, radius_step_km: 2, max_radius_km: 10, max_rounds: 6,
  broadcast_size: 3, offer_timeout_s: 30, location_max_age_s: 120, respect_schedule: false, bike_blackout: [], weight_distance: 0.6, weight_rating: 0.2, weight_acceptance: 0.2,
};

export async function getDispatchRule(db: Queryable, zoneId: string | null): Promise<DispatchRule> {
  const r = await one(db, `SELECT * FROM dispatch_rules WHERE zone_id = $1 OR zone_id IS NULL ORDER BY zone_id NULLS LAST LIMIT 1`, [zoneId]);
  return r ? { ...FALLBACK_RULE, ...r } : FALLBACK_RULE;
}

export const radiusForRound = (rule: DispatchRule, round: number) =>
  Math.min(Number(rule.search_radius_km) + Math.max(0, round - 1) * Number(rule.radius_step_km), Number(rule.max_radius_km));

/** Candidate score in [0,1]; higher is better. Pure — unit tested. */
export function scoreCandidate(rule: DispatchRule, c: { distance_m: number; rating_avg: number; acceptance: number }, radiusM: number) {
  const proximity = Math.max(0, 1 - c.distance_m / Math.max(radiusM, 1));
  return Number(rule.weight_distance) * proximity + Number(rule.weight_rating) * (Number(c.rating_avg) / 5) + Number(rule.weight_acceptance) * Number(c.acceptance);
}

export async function findCandidates(db: Queryable, delivery: any, rule: DispatchRule, radiusKm: number, now = new Date()) {
  const settings = await getSettings(db);
  const params: unknown[] = [delivery.id, radiusKm * 1000, rule.location_max_age_s, delivery.zone_id];
  const extra: string[] = [];
  if (delivery.vehicle_type) { params.push(delivery.vehicle_type); extra.push(`c.vehicle_type = $${params.length}`); }
  if (delivery.package_size === 'large') extra.push(`c.vehicle_type IN ('car','van')`);
  if (inBlackout(rule.bike_blackout, now)) extra.push(`c.vehicle_type <> 'bike'`);
  if (delivery.cod_amount_baisa > 0) {
    params.push(settings.captainCashLimitBaisa);
    extra.push(`COALESCE((SELECT -SUM(le.amount_baisa) FROM ledger_entries le WHERE le.account_type = 'captain' AND le.account_id = c.id
                 AND le.entry_type IN ('cod_collected','cod_remitted')), 0) + d.cod_amount_baisa <= $${params.length}`);
  }
  if (rule.respect_schedule) {
    const t = muscatNow(now);
    params.push(t.weekday, t.hhmm);
    extra.push(`EXISTS (SELECT 1 FROM captain_availability a WHERE a.captain_id = c.id AND a.weekday = $${params.length - 1}
                 AND a.start_time <= $${params.length}::time AND a.end_time > $${params.length}::time)`);
  }
  const rows = await q(
    db,
    `SELECT c.id, c.user_id, c.vehicle_type, c.rating_avg, ST_Distance(cl.location, d.pickup_location) AS distance_m,
            CASE WHEN c.offers_received > 0 THEN c.offers_accepted::float / c.offers_received ELSE 1 END AS acceptance
       FROM deliveries d, captains c JOIN captain_locations cl ON cl.captain_id = c.id
      WHERE d.id = $1
        AND c.status = 'active' AND c.is_online
        AND cl.updated_at > now() - make_interval(secs => $3)
        AND ST_DWithin(cl.location, d.pickup_location, $2)
        AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM captain_zones cz WHERE cz.captain_id = c.id AND cz.zone_id = $4))
        AND (SELECT count(*) FROM deliveries x WHERE x.captain_id = c.id AND x.status IN ('assigned','at_pickup','picked_up','at_dropoff')) < c.max_concurrent
        AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.delivery_id = d.id AND o.captain_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.captain_id = c.id AND o.status = 'pending')
        AND NOT EXISTS (SELECT 1 FROM captain_documents cd WHERE cd.captain_id = c.id AND cd.status = 'approved' AND cd.expires_at < current_date)
        ${extra.length ? 'AND ' + extra.join(' AND ') : ''}`,
    params,
  );
  const radiusM = radiusKm * 1000;
  return rows
    .map((r) => ({ ...r, distance_m: Number(r.distance_m), score: scoreCandidate(rule, r, radiusM) }))
    .sort((a, b) => b.score - a.score);
}

async function setDeliveryStatus(db: Queryable, d: any, to: string, actor: string | null, data: Record<string, unknown> = {}, extraSets: string[] = [], extraParams: unknown[] = []) {
  assertDeliveryTransition(d.status, to);
  const ts: Record<string, string> = { assigned: 'assigned_at', at_pickup: 'at_pickup_at', picked_up: 'picked_up_at', at_dropoff: 'at_dropoff_at', delivered: 'delivered_at', failed: 'failed_at', cancelled: 'cancelled_at' };
  const sets = ['status = $2', 'updated_at = now()', ...(ts[to] ? [`${ts[to]} = now()`] : []), ...extraSets];
  const updated = await one(db, `UPDATE deliveries SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [d.id, to, ...extraParams]);
  await q(db, `INSERT INTO delivery_events (delivery_id, type, from_status, to_status, actor_user_id, data) VALUES ($1,'status',$2,$3,$4,$5)`, [d.id, d.status, to, actor, JSON.stringify(data)]);
  const o = await one(db, `SELECT id, merchant_id FROM orders WHERE id = $1`, [d.order_id]);
  await publish(db, [`order:${o.id}`, `delivery:${d.id}`, ...(o.merchant_id ? [`merchant:${o.merchant_id}`] : []), ...(updated.captain_id ? [`captain:${updated.captain_id}`] : []), 'admin:ops'],
    'delivery.status_changed', { deliveryId: d.id, orderId: o.id, from: d.status, to, captainId: updated.captain_id });
  return updated;
}
export { setDeliveryStatus };

export async function startDispatch(db: Queryable, deliveryId: string) {
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [deliveryId]);
  if (!d || !['created', 'unassigned'].includes(d.status)) return;
  const rule = await getDispatchRule(db, d.zone_id);
  if (!rule.auto_dispatch || rule.strategy === 'manual') {
    if (d.status !== 'unassigned') await setDeliveryStatus(db, d, 'unassigned', null, { reason: 'manual_dispatch' });
    return;
  }
  await setDeliveryStatus(db, d, 'searching', null, {}, ['dispatch_round = 0']);
  await runRound(db, deliveryId);
}

/** One dispatch round: offer to the best candidate(s), or widen the radius / give up. */
export async function runRound(db: Queryable, deliveryId: string, now = new Date()) {
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [deliveryId]);
  if (!d || d.status !== 'searching') return { offered: 0 };
  const pending = await one(db, `SELECT count(*)::int AS n FROM delivery_offers WHERE delivery_id = $1 AND status = 'pending'`, [deliveryId]);
  if (pending.n > 0) return { offered: 0 };
  const rule = await getDispatchRule(db, d.zone_id);
  const round = d.dispatch_round + 1;
  if (round > rule.max_rounds) {
    await setDeliveryStatus(db, d, 'unassigned', null, { reason: 'no_captain_found', rounds: d.dispatch_round });
    return { offered: 0, unassigned: true };
  }
  const radiusKm = radiusForRound(rule, round);
  const candidates = await findCandidates(db, d, rule, radiusKm, now);
  const chosen = candidates.slice(0, rule.strategy === 'broadcast' ? rule.broadcast_size : 1);
  await q(db, `UPDATE deliveries SET dispatch_round = $2, current_radius_km = $3, updated_at = now() WHERE id = $1`, [deliveryId, round, radiusKm]);
  const order = await one(db, `SELECT o.number, o.type, m.name_en FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`, [d.order_id]);
  for (const c of chosen) {
    const offer = await one(
      db,
      `INSERT INTO delivery_offers (delivery_id, captain_id, round, score, distance_to_pickup_m, earning_baisa, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(secs => $7)) RETURNING *`,
      [deliveryId, c.id, round, c.score.toFixed(4), Math.round(c.distance_m), d.captain_earning_baisa, rule.offer_timeout_s],
    );
    await q(db, `UPDATE captains SET offers_received = offers_received + 1 WHERE id = $1`, [c.id]);
    await publish(db, [`captain:${c.id}`], 'offer.created', await offerDto(db, offer.id));
    await notify(db, c.user_id, 'offer.created', { offerId: offer.id, deliveryId, earning: formatOMR(d.captain_earning_baisa), seconds: rule.offer_timeout_s, number: order.number });
  }
  return { offered: chosen.length, radiusKm, round };
}

export async function offerDto(db: Queryable, offerId: string) {
  const r = await one(
    db,
    `SELECT o.*, d.cod_amount_baisa, d.distance_m AS trip_m, d.package_size, d.vehicle_type, d.pickup_address, d.dropoff_address,
            ST_Y(d.pickup_location::geometry) AS pu_lat, ST_X(d.pickup_location::geometry) AS pu_lng,
            ST_Y(d.dropoff_location::geometry) AS do_lat, ST_X(d.dropoff_location::geometry) AS do_lng,
            ord.type AS order_type, m.name_en AS merchant_name,
            (SELECT name_en FROM zones z WHERE ST_Covers(z.boundary, d.pickup_location) LIMIT 1) AS pickup_area,
            (SELECT name_en FROM zones z WHERE ST_Covers(z.boundary, d.dropoff_location) LIMIT 1) AS dropoff_area
       FROM delivery_offers o JOIN deliveries d ON d.id = o.delivery_id JOIN orders ord ON ord.id = d.order_id LEFT JOIN merchants m ON m.id = ord.merchant_id
      WHERE o.id = $1`,
    [offerId],
  );
  if (!r) throw notFound('Offer');
  const drop = rowPoint(r, 'do')!;
  return {
    id: r.id,
    deliveryId: r.delivery_id,
    status: r.status,
    orderType: r.order_type,
    expiresAt: r.expires_at,
    earningBaisa: r.earning_baisa,
    codAmountBaisa: r.cod_amount_baisa,
    distanceToPickupM: r.distance_to_pickup_m,
    tripDistanceM: r.trip_m,
    pickupArea: r.pickup_area ?? r.pickup_address,
    dropoffArea: r.dropoff_area ?? '',
    pickupLocation: rowPoint(r, 'pu'),
    dropoffLocation: { lat: Math.round(drop.lat * 200) / 200, lng: Math.round(drop.lng * 200) / 200 },
    merchantName: r.merchant_name,
    packageSize: r.package_size,
    vehicleType: r.vehicle_type,
  };
}

export async function acceptOffer(db: Queryable, captainId: string, offerId: string, actorUserId: string) {
  // Lock order is always delivery → offers (same as assignCaptain/cancel paths) to avoid deadlocks when captains race.
  const peek = await one(db, `SELECT delivery_id, captain_id FROM delivery_offers WHERE id = $1`, [offerId]);
  if (!peek || peek.captain_id !== captainId) throw notFound('Offer');
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [peek.delivery_id]);
  const offer = await one(db, `SELECT * FROM delivery_offers WHERE id = $1 FOR UPDATE`, [offerId]);
  if (offer.status !== 'pending' || new Date(offer.expires_at) < new Date()) throw conflict('This offer is no longer available', offer.status === 'cancelled' ? 'offer_taken' : 'offer_expired');
  if (d.captain_id || !['searching', 'unassigned'].includes(d.status)) {
    // Returned (not thrown) so the caller's transaction commits the cancellation.
    await q(db, `UPDATE delivery_offers SET status = 'cancelled', responded_at = now() WHERE id = $1`, [offerId]);
    return { error: conflict('Another captain took this delivery', 'offer_taken') };
  }
  await q(db, `UPDATE delivery_offers SET status = 'accepted', responded_at = now() WHERE id = $1`, [offerId]);
  await q(db, `UPDATE captains SET offers_accepted = offers_accepted + 1 WHERE id = $1`, [captainId]);
  await assignCaptain(db, d, captainId, actorUserId, offerId);
  return { ok: true as const };
}

/** Assign a captain (from an accepted offer or manually). Cancels other pending offers. */
export async function assignCaptain(db: Queryable, d: any, captainId: string, actorUserId: string | null, acceptedOfferId?: string) {
  const others = await q(db, `UPDATE delivery_offers SET status = 'cancelled', responded_at = now() WHERE delivery_id = $1 AND status = 'pending' AND id IS DISTINCT FROM $2 RETURNING id, captain_id`, [d.id, acceptedOfferId ?? null]);
  for (const o of others) await publish(db, [`captain:${o.captain_id}`], 'offer.cancelled', { offerId: o.id, deliveryId: d.id });
  const loc = await one(db, `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM captain_locations WHERE captain_id = $1`, [captainId]);
  const cap = await one(db, `SELECT c.vehicle_type, c.user_id, u.full_name FROM captains c JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [captainId]);
  const pickup = await one(db, `SELECT ST_Y(pickup_location::geometry) AS lat, ST_X(pickup_location::geometry) AS lng FROM deliveries WHERE id = $1`, [d.id]);
  const toPickupS = loc ? estimateRoute({ lat: Number(loc.lat), lng: Number(loc.lng) }, { lat: Number(pickup.lat), lng: Number(pickup.lng) }, cap.vehicle_type).durationS : 600;
  const updated = await setDeliveryStatus(db, d, 'assigned', actorUserId, { captainId }, [
    'captain_id = $3', `eta_pickup_at = now() + make_interval(secs => $4::int)`, `eta_dropoff_at = now() + make_interval(secs => $4::int + estimated_duration_s)`,
  ], [captainId, toPickupS]);
  const o = await one(db, `SELECT id, number, customer_user_id, merchant_id FROM orders WHERE id = $1`, [d.order_id]);
  await publish(db, [`order:${o.id}`, `captain:${captainId}`, ...(o.merchant_id ? [`merchant:${o.merchant_id}`] : []), 'admin:ops'], 'delivery.assigned', {
    deliveryId: d.id, orderId: o.id, captainId, etaPickupAt: updated.eta_pickup_at,
  });
  if (o.customer_user_id) await notify(db, o.customer_user_id, 'delivery.assigned', { number: o.number, captain: (cap.full_name ?? '').split(' ')[0], orderId: o.id });
  return updated;
}

export async function rejectOffer(db: Queryable, captainId: string, offerId: string, reason?: string) {
  const peek = await one(db, `SELECT delivery_id FROM delivery_offers WHERE id = $1 AND captain_id = $2`, [offerId, captainId]);
  if (!peek) throw notFound('Offer');
  await q(db, `SELECT id FROM deliveries WHERE id = $1 FOR UPDATE`, [peek.delivery_id]); // lock order: delivery → offers
  const offer = await one(db, `UPDATE delivery_offers SET status = 'rejected', responded_at = now(), reject_reason = $3 WHERE id = $1 AND captain_id = $2 AND status = 'pending' RETURNING *`, [offerId, captainId, reason ?? null]);
  if (!offer) throw conflict('This offer is no longer pending', 'offer_expired');
  await runRound(db, offer.delivery_id);
}

/**
 * Worker: expire stale offers and re-run dispatch for deliveries that need it. Each step is its own short
 * transaction (expiry first, then one transaction per delivery) so the worker never holds offer locks while
 * waiting for a delivery lock — that ordering would deadlock against a captain accepting concurrently.
 */
export async function dispatchTick(pool: import('pg').Pool) {
  const { tx } = await import('../../db/pool.js');
  const expired = await tx(async (c) => {
    const rows = await q(
      c,
      `UPDATE delivery_offers SET status = 'expired' WHERE id IN (
         SELECT id FROM delivery_offers WHERE status = 'pending' AND expires_at < now() FOR UPDATE SKIP LOCKED) RETURNING id, delivery_id, captain_id`,
    );
    for (const e of rows) await publish(c, [`captain:${e.captain_id}`], 'offer.expired', { offerId: e.id, deliveryId: e.delivery_id });
    return rows;
  }, pool);
  const due = await q(
    pool,
    `SELECT d.id FROM deliveries d WHERE d.status = 'searching'
        AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.delivery_id = d.id AND o.status = 'pending')
        AND (d.id = ANY($1) OR d.updated_at < now() - interval '10 seconds')
      ORDER BY d.created_at LIMIT 50`,
    [expired.map((e) => e.delivery_id)],
  );
  for (const d of due) await tx((c) => runRound(c, d.id), pool);
  return { expired: expired.length, rounds: due.length };
}

export async function releaseDelivery(db: Queryable, d: any, actorUserId: string, reason: string) {
  await setDeliveryStatus(db, d, 'searching', actorUserId, { reason, releasedCaptainId: d.captain_id }, ['captain_id = NULL', 'eta_pickup_at = NULL']);
  await runRound(db, d.id);
}

export async function cancelDeliveryForOrder(db: Queryable, deliveryId: string, actor: string | null, reason: string) {
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [deliveryId]);
  if (!d || d.status === 'cancelled') return;
  const offers = await q(db, `UPDATE delivery_offers SET status = 'cancelled', responded_at = now() WHERE delivery_id = $1 AND status = 'pending' RETURNING id, captain_id`, [deliveryId]);
  for (const o of offers) await publish(db, [`captain:${o.captain_id}`], 'offer.cancelled', { offerId: o.id, deliveryId });
  await setDeliveryStatus(db, d, 'cancelled', actor, { reason });
}

export async function manualAssign(db: Queryable, deliveryId: string, captainId: string, actorUserId: string) {
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1 FOR UPDATE`, [deliveryId]);
  if (!d) throw notFound('Delivery');
  if (!['created', 'searching', 'unassigned', 'assigned', 'at_pickup'].includes(d.status)) throw conflict('Delivery can no longer be reassigned', 'invalid_transition');
  const c = await one(db, `SELECT id, status, max_concurrent FROM captains WHERE id = $1`, [captainId]);
  if (!c) throw notFound('Captain');
  if (c.status !== 'active') throw forbidden('Captain is not active');
  const load = await one(db, `SELECT count(*)::int AS n FROM deliveries WHERE captain_id = $1 AND status = ANY($2) AND id <> $3`, [captainId, ACTIVE_DELIVERY_STATUSES, deliveryId]);
  if (load.n >= c.max_concurrent) throw conflict('Captain is at capacity', 'captain_busy');
  if (d.captain_id && d.captain_id !== captainId) await publish(db, [`captain:${d.captain_id}`], 'delivery.unassigned', { deliveryId });
  await q(db, `INSERT INTO delivery_offers (delivery_id, captain_id, status, round, earning_baisa, expires_at, responded_at) VALUES ($1,$2,'accepted',0,$3, now(), now())`, [deliveryId, captainId, d.captain_earning_baisa]);
  const target = d.status === 'created' ? { ...d } : d;
  return assignCaptain(db, target, captainId, actorUserId);
}
