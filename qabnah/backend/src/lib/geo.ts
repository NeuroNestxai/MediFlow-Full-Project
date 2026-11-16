export interface LatLng { lat: number; lng: number }

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** SQL fragment for a geography point from $lng,$lat params. */
export const pointSql = (lngParam: string, latParam: string) =>
  `ST_SetSRID(ST_MakePoint(${lngParam}, ${latParam}), 4326)::geography`;

/** Approximate road routing (DECISIONS D-009). */
export const ROAD_FACTOR: Record<string, number> = { bike: 1.5, car: 1.35, van: 1.35, any: 1.35 };
export const AVG_SPEED_MPS: Record<string, number> = { bike: 7.5, car: 9.5, van: 8.5, any: 9 }; // ~27 / 34 / 30 km/h urban

export function estimateRoute(a: LatLng, b: LatLng, vehicle: string | null | undefined) {
  const v = vehicle ?? 'any';
  const distanceM = Math.round(haversineM(a, b) * (ROAD_FACTOR[v] ?? 1.35));
  const durationS = Math.round(distanceM / (AVG_SPEED_MPS[v] ?? 9)) + 120; // + 2 min parking/handover
  return { distanceM, durationS };
}

/** Round to ~500 m grid to avoid exposing exact addresses before acceptance. */
export function coarsen(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 200) / 200, lng: Math.round(p.lng * 200) / 200 };
}

export const latLngCols = (col: string, alias: string) =>
  `ST_Y(${col}::geometry) AS ${alias}_lat, ST_X(${col}::geometry) AS ${alias}_lng`;

export function rowPoint(row: any, alias: string): LatLng | null {
  const lat = row[`${alias}_lat`];
  const lng = row[`${alias}_lng`];
  return lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) };
}
