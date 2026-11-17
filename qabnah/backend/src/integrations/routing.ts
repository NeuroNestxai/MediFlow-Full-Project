import { config } from '../config.js';
import { estimateRoute, type LatLng } from '../lib/geo.js';

/**
 * Road routing for fees and ETAs (DECISIONS D-009).
 *  - haversine (default): straight line × road factor, average speed per vehicle.
 *  - osrm: OSRM HTTP API (self-hosted with an Oman OpenStreetMap extract). Falls back to haversine on
 *    timeout/error so quoting never fails because routing is down.
 * Bike adjustment: OSRM car profile is used for all vehicles; bikes keep the haversine bike factor as a floor
 * because delivery motorcycles may not use main roads (research §3.3).
 */
export interface Route { distanceM: number; durationS: number; source: 'haversine' | 'osrm' }

export async function route(a: LatLng, b: LatLng, vehicle: string | null | undefined, opts: { timeoutMs?: number } = {}): Promise<Route> {
  const fallback = (): Route => ({ ...estimateRoute(a, b, vehicle), source: 'haversine' });
  if (config.ROUTING_PROVIDER !== 'osrm' || !config.OSRM_URL) return fallback();
  try {
    const url = `${config.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 800) });
    if (!res.ok) return fallback();
    const j: any = await res.json();
    const r = j?.routes?.[0];
    if (j?.code !== 'Ok' || !r) return fallback();
    let distanceM = Math.round(r.distance);
    let durationS = Math.round(r.duration) + 120; // parking / handover
    if (vehicle === 'bike') {
      const h = estimateRoute(a, b, 'bike');
      distanceM = Math.max(distanceM, h.distanceM);
      durationS = Math.max(durationS, h.durationS);
    }
    return { distanceM, durationS, source: 'osrm' };
  } catch {
    return fallback();
  }
}
