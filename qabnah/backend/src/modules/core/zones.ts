import { one, type Queryable } from '../../db/pool.js';
import type { LatLng } from '../../lib/geo.js';

export async function zoneForPoint(db: Queryable, p: LatLng): Promise<{ id: string; code: string; name_en: string; name_ar: string } | null> {
  return one(
    db,
    `SELECT id, code, name_en, name_ar FROM zones
      WHERE is_active AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)
      ORDER BY ST_Area(boundary) ASC LIMIT 1`,
    [p.lng, p.lat],
  );
}

export function zoneDto(r: any) {
  return { id: r.id, code: r.code, nameEn: r.name_en, nameAr: r.name_ar, isActive: r.is_active, boundary: typeof r.boundary === 'string' ? JSON.parse(r.boundary) : r.boundary };
}
