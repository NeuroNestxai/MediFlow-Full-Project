import { one, type Queryable } from '../../db/pool.js';
import { unprocessable } from '../../lib/errors.js';
import { estimateRoute, type LatLng } from '../../lib/geo.js';
import { applyBps, roundBaisa } from '../../lib/money.js';
import { zoneForPoint } from './zones.js';

export type DeliveryType = 'marketplace' | 'merchant_delivery' | 'c2c';
export type Vehicle = 'bike' | 'car' | 'van';

export interface PricingRuleRow {
  id: string;
  base_fee_baisa: number;
  per_km_baisa: number;
  included_km: number;
  min_fee_baisa: number;
  max_fee_baisa: number | null;
  max_distance_km: number;
  surge_multiplier: number;
  captain_share_bps: number;
}

/** Pure fee formula — see DATABASE_SCHEMA.md pricing_rules. */
export function computeFee(rule: PricingRuleRow, distanceM: number) {
  const km = distanceM / 1000;
  const billableKm = Math.max(0, km - Number(rule.included_km));
  let fee = rule.base_fee_baisa + rule.per_km_baisa * billableKm;
  fee = Math.max(fee, rule.min_fee_baisa);
  fee = fee * Number(rule.surge_multiplier);
  if (rule.max_fee_baisa != null) fee = Math.min(fee, rule.max_fee_baisa);
  // Round to the nearest 10 baisa for display-friendly prices.
  const feeBaisa = Math.round(roundBaisa(fee) / 10) * 10;
  return { feeBaisa, captainEarningBaisa: applyBps(feeBaisa, rule.captain_share_bps) };
}

export async function resolveRule(db: Queryable, zoneId: string | null, type: DeliveryType, vehicle: Vehicle | null): Promise<PricingRuleRow | null> {
  return one<PricingRuleRow>(
    db,
    `SELECT * FROM pricing_rules
      WHERE is_active
        AND (zone_id IS NULL OR zone_id = $1)
        AND (delivery_type IS NULL OR delivery_type = $2)
        AND (vehicle_type IS NULL OR vehicle_type = $3)
      ORDER BY ((zone_id IS NOT NULL)::int * 4 + (delivery_type IS NOT NULL)::int * 2 + (vehicle_type IS NOT NULL)::int) DESC, priority DESC
      LIMIT 1`,
    [zoneId, type, vehicle],
  );
}

export interface Quote {
  feeBaisa: number;
  captainEarningBaisa: number;
  distanceM: number;
  estimatedDurationS: number;
  zoneId: string | null;
  vehicleType: Vehicle | null;
  currency: 'OMR';
}

export async function quoteDelivery(db: Queryable, input: { type: DeliveryType; pickup: LatLng; dropoff: LatLng; vehicleType?: Vehicle | null }): Promise<Quote> {
  const [pz, dz] = await Promise.all([zoneForPoint(db, input.pickup), zoneForPoint(db, input.dropoff)]);
  if (!pz) throw unprocessable('out_of_service_area', 'Pickup location is outside our service area');
  if (!dz) throw unprocessable('out_of_service_area', 'Delivery location is outside our service area');
  const vehicle = input.vehicleType ?? null;
  const rule = await resolveRule(db, pz.id, input.type, vehicle);
  if (!rule) throw unprocessable('no_pricing_rule', 'Delivery is not available for this route yet');
  const route = estimateRoute(input.pickup, input.dropoff, vehicle);
  if (route.distanceM / 1000 > Number(rule.max_distance_km)) throw unprocessable('out_of_service_area', 'Distance exceeds the maximum delivery distance');
  const { feeBaisa, captainEarningBaisa } = computeFee(rule, route.distanceM);
  return { feeBaisa, captainEarningBaisa, distanceM: route.distanceM, estimatedDurationS: route.durationS, zoneId: pz.id, vehicleType: vehicle, currency: 'OMR' };
}
