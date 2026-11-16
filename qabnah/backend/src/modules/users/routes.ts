import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { invalidateAuthCache, requireAuth } from '../../lib/auth.js';
import { conflict, notFound } from '../../lib/errors.js';
import { latLngCols, rowPoint } from '../../lib/geo.js';
import { normalizeOmanPhone } from '../../lib/phone.js';
import { parse, zIdParam, zLatLng, zPaging } from '../../lib/validate.js';
import { getCaptainProfile } from '../captains/profile.js';
import { userDto } from './dto.js';

const addressInput = z.object({
  label: z.string().max(40).optional(),
  location: zLatLng,
  area: z.string().max(100).optional(),
  street: z.string().max(100).optional(),
  building: z.string().max(60).optional(),
  floor: z.string().max(20).optional(),
  apartment: z.string().max(20).optional(),
  landmark: z.string().max(300).optional(),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const ADDRESS_SELECT = `SELECT a.*, ${latLngCols('a.location', 'loc')},
  (SELECT z.id FROM zones z WHERE z.is_active AND ST_Covers(z.boundary, a.location) LIMIT 1) AS zone_id FROM addresses a`;

export const addressDto = (a: any) => ({
  id: a.id,
  label: a.label,
  location: rowPoint(a, 'loc'),
  area: a.area,
  street: a.street,
  building: a.building,
  floor: a.floor,
  apartment: a.apartment,
  landmark: a.landmark,
  contactName: a.contact_name,
  contactPhone: a.contact_phone,
  isDefault: a.is_default,
  zoneId: a.zone_id ?? null,
  createdAt: a.created_at,
});

export function addressText(a: any) {
  return [a.building && `Bldg ${a.building}`, a.floor && `Floor ${a.floor}`, a.apartment && `Apt ${a.apartment}`, a.street, a.area, a.landmark]
    .filter(Boolean)
    .join(', ');
}

export async function buildMe(userId: string) {
  invalidateAuthCache(userId);
  const user = await one(pool, `SELECT * FROM users WHERE id = $1`, [userId]);
  const roles = await q(pool, `SELECT r.key, ur.merchant_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [userId]);
  const perms = await q(
    pool,
    `SELECT DISTINCT rp.permission_key, ur.merchant_id, r.scope FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id WHERE ur.user_id = $1`,
    [userId],
  );
  const merchantIds = [...new Set(roles.filter((r) => r.merchant_id).map((r) => r.merchant_id))];
  const merchants = merchantIds.length
    ? await q(pool, `SELECT id, slug, name_en, name_ar, status, logo_url FROM merchants WHERE id = ANY($1)`, [merchantIds])
    : [];
  const captain = await one(pool, `SELECT id FROM captains WHERE user_id = $1`, [userId]);
  return {
    user: userDto(user),
    roles: roles.map((r) => ({ key: r.key, merchantId: r.merchant_id })),
    permissions: perms.filter((p) => p.scope === 'platform').map((p) => p.permission_key).sort(),
    merchants: merchants.map((m) => ({
      id: m.id,
      slug: m.slug,
      nameEn: m.name_en,
      nameAr: m.name_ar,
      status: m.status,
      logoUrl: m.logo_url,
      roles: roles.filter((r) => r.merchant_id === m.id).map((r) => r.key),
      permissions: perms.filter((p) => p.merchant_id === m.id).map((p) => p.permission_key).sort(),
    })),
    captain: captain ? await getCaptainProfile(pool, captain.id) : null,
  };
}

export default async function userRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => buildMe(requireAuth(req).userId));

  app.patch('/me', async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ fullName: z.string().trim().min(1).max(100).optional(), locale: z.enum(['ar', 'en']).optional(), email: z.string().email().optional() }), req.body);
    if (body.email && (await one(pool, `SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [body.email, auth.userId]))) throw conflict('Email already in use', 'email_taken');
    await q(pool, `UPDATE users SET full_name = COALESCE($2, full_name), locale = COALESCE($3, locale), email = COALESCE($4, email), updated_at = now() WHERE id = $1`, [
      auth.userId, body.fullName ?? null, body.locale ?? null, body.email ?? null,
    ]);
    return buildMe(auth.userId);
  });

  app.get('/me/addresses', async (req) => {
    const auth = requireAuth(req);
    const rows = await q(pool, `${ADDRESS_SELECT} WHERE a.user_id = $1 ORDER BY a.is_default DESC, a.created_at DESC`, [auth.userId]);
    return { items: rows.map(addressDto) };
  });

  app.post('/me/addresses', async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(addressInput, req.body);
    const phone = b.contactPhone ? normalizeOmanPhone(b.contactPhone) : null;
    const row = await tx(async (c) => {
      const count = await one(c, `SELECT count(*)::int AS n FROM addresses WHERE user_id = $1`, [auth.userId]);
      const isDefault = b.isDefault ?? count.n === 0;
      if (isDefault) await q(c, `UPDATE addresses SET is_default = false WHERE user_id = $1`, [auth.userId]);
      const ins = await one(
        c,
        `INSERT INTO addresses (user_id, label, location, area, street, building, floor, apartment, landmark, contact_name, contact_phone, is_default)
         VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [auth.userId, b.label ?? 'home', b.location.lng, b.location.lat, b.area, b.street, b.building, b.floor, b.apartment, b.landmark, b.contactName, phone, isDefault],
      );
      return one(c, `${ADDRESS_SELECT} WHERE a.id = $1`, [ins.id]);
    });
    reply.code(201);
    return addressDto(row);
  });

  app.patch('/me/addresses/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(zIdParam, req.params);
    const b = parse(addressInput.partial(), req.body);
    return tx(async (c) => {
      const a = await one(c, `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`, [id, auth.userId]);
      if (!a) throw notFound('Address');
      if (b.isDefault) await q(c, `UPDATE addresses SET is_default = false WHERE user_id = $1`, [auth.userId]);
      await q(
        c,
        `UPDATE addresses SET label = COALESCE($2,label), area = COALESCE($3,area), street = COALESCE($4,street), building = COALESCE($5,building),
           floor = COALESCE($6,floor), apartment = COALESCE($7,apartment), landmark = COALESCE($8,landmark), contact_name = COALESCE($9,contact_name),
           contact_phone = COALESCE($10,contact_phone), is_default = COALESCE($11,is_default),
           location = CASE WHEN $12::float8 IS NULL THEN location ELSE ST_SetSRID(ST_MakePoint($12,$13),4326)::geography END
         WHERE id = $1`,
        [id, b.label, b.area, b.street, b.building, b.floor, b.apartment, b.landmark, b.contactName, b.contactPhone ? normalizeOmanPhone(b.contactPhone) : null, b.isDefault ?? null, b.location?.lng ?? null, b.location?.lat ?? null],
      );
      return addressDto(await one(c, `${ADDRESS_SELECT} WHERE a.id = $1`, [id]));
    });
  });

  app.delete('/me/addresses/:id', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(zIdParam, req.params);
    const r = await q(pool, `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`, [id, auth.userId]);
    if (!r.length) throw notFound('Address');
    reply.code(204);
  });

  app.get('/me/notifications', async (req) => {
    const auth = requireAuth(req);
    const { limit, offset } = parse(zPaging, req.query);
    const [items, counts] = await Promise.all([
      q(pool, `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [auth.userId, limit, offset]),
      one(pool, `SELECT count(*)::int AS total, count(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notifications WHERE user_id = $1`, [auth.userId]),
    ]);
    return {
      items: items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, readAt: n.read_at, createdAt: n.created_at })),
      unread: counts.unread,
      total: counts.total,
    };
  });

  app.post('/me/notifications/:id/read', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(zIdParam, req.params);
    await q(pool, `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`, [id, auth.userId]);
    reply.code(204);
  });

  app.post('/me/devices', async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(z.object({ platform: z.enum(['ios', 'android', 'web']), app: z.enum(['consumer', 'captain', 'merchant', 'admin']), token: z.string().min(10).max(4096) }), req.body);
    await q(pool, `INSERT INTO device_tokens (user_id, platform, app, token) VALUES ($1,$2,$3,$4) ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, app = EXCLUDED.app`, [
      auth.userId, b.platform, b.app, b.token,
    ]);
    reply.code(204);
  });
}
