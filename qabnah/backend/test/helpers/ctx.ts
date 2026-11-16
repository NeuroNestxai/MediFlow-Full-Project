import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { pool, one, q } from '../../src/db/pool.js';
import { invalidateAuthCache } from '../../src/lib/auth.js';
import { seedReference, wipe } from '../../src/scripts/seed.js';

export const PASSWORD = 'Test-Password-123';
let app: FastifyInstance | null = null;

export async function getApp() {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  return app;
}

/** Wipe business data and load reference data (zones, pricing rules, dispatch rule, plans). */
export async function resetDb() {
  invalidateAuthCache();
  await wipe();
  await seedReference();
  // Deterministic tests: no bike blackout and all hours open unless a test opts in.
  await q(pool, `UPDATE dispatch_rules SET bike_blackout = '[]'`);
}

export interface Res<T = any> { status: number; body: T; headers: Record<string, unknown> }

export async function api<T = any>(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res<T>> {
  const a = await getApp();
  const r = await a.inject({
    method: method as any,
    url: url.startsWith('/v1') ? url : `/v1${url}`,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) },
    payload: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = r.body;
  try { body = r.json(); } catch { /* not json */ }
  return { status: r.statusCode, body, headers: r.headers };
}

let phoneSeq = 1000;
export const nextPhone = () => `+96891${String(++phoneSeq).padStart(6, '0')}`;

/** Sign up / sign in a phone user through the real OTP endpoints. */
export async function phoneLogin(phone = nextPhone(), fullName = 'Test User') {
  const r1 = await api('POST', '/auth/otp/request', { body: { phone } });
  if (r1.status !== 200) throw new Error(`otp request failed ${r1.status} ${JSON.stringify(r1.body)}`);
  const r2 = await api('POST', '/auth/otp/verify', { body: { phone, code: r1.body.devCode, fullName } });
  if (r2.status !== 200) throw new Error(`otp verify failed ${JSON.stringify(r2.body)}`);
  return { token: r2.body.accessToken as string, refreshToken: r2.body.refreshToken as string, userId: r2.body.user.id as string, phone };
}

export async function staff(role: string, email = `${role}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@qabnah.test`) {
  const u = await one(pool, `INSERT INTO users (email, full_name, password_hash, locale) VALUES ($1,$2,$3,'en') RETURNING id`, [email, `${role} user`, await bcrypt.hash(PASSWORD, 4)]);
  await q(pool, `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = $2`, [u.id, role]);
  const r = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return { token: r.body.accessToken as string, userId: u.id as string, email };
}

export const KHUWAIR = { lat: 23.5885, lng: 58.4362 };
export const QURUM = { lat: 23.6105, lng: 58.4802 };
export const MSQ = { lat: 23.6085, lng: 58.4105 };
export const SEEB = { lat: 23.6702, lng: 58.1885 };

let slugSeq = 0;
/** Register a merchant through the API, approve it and open it all day. Returns owner token + merchant id. */
export async function merchant(opts: { location?: { lat: number; lng: number }; commissionBps?: number } = {}) {
  const slug = `store-${Date.now().toString(36)}-${++slugSeq}`;
  const email = `${slug}@qabnah.test`;
  const r = await api('POST', '/merchants/register', {
    body: { email, password: 'Merchant-Pass-123', fullName: 'Owner', merchant: { nameEn: `Store ${slugSeq}`, nameAr: `متجر ${slugSeq}`, slug, category: 'restaurant', location: opts.location ?? KHUWAIR } },
  });
  if (r.status !== 201) throw new Error(`register failed ${JSON.stringify(r.body)}`);
  await q(pool, `UPDATE merchants SET status = 'active', opening_hours = '[]', is_open = true, commission_bps_override = $2 WHERE id = $1`, [r.body.merchantId, opts.commissionBps ?? 1000]);
  return { token: r.body.accessToken as string, merchantId: r.body.merchantId as string, slug, ownerId: r.body.user.id as string, email };
}

export async function product(m: { token: string; merchantId: string }, body: Record<string, unknown> = {}) {
  const r = await api('POST', `/merchants/${m.merchantId}/products`, {
    token: m.token,
    body: {
      nameEn: 'Chicken Shawarma', nameAr: 'شاورما دجاج', basePriceBaisa: 900,
      optionGroups: [
        { kind: 'variant', nameEn: 'Size', nameAr: 'الحجم', options: [{ nameEn: 'Regular', nameAr: 'عادي', priceDeltaBaisa: 0 }, { nameEn: 'Large', nameAr: 'كبير', priceDeltaBaisa: 400 }] },
        { kind: 'addon', nameEn: 'Extras', nameAr: 'إضافات', maxSelect: 2, options: [{ nameEn: 'Cheese', nameAr: 'جبن', priceDeltaBaisa: 200 }, { nameEn: 'Garlic', nameAr: 'ثوم', priceDeltaBaisa: 100 }, { nameEn: 'Fries', nameAr: 'بطاطس', priceDeltaBaisa: 150 }] },
      ],
      ...body,
    },
  });
  if (r.status !== 201) throw new Error(`product failed ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Create an active, online captain at a location serving the given zones (bypasses document review). */
export async function captain(opts: { location?: { lat: number; lng: number }; vehicle?: 'bike' | 'car' | 'van'; zones?: string[]; nationality?: string; online?: boolean } = {}) {
  const u = await phoneLogin(nextPhone(), 'Captain Test');
  const reg = await api('POST', '/captain/register', { token: u.token, body: { vehicleType: opts.vehicle ?? 'car', vehiclePlate: '1234 AB', nationality: opts.nationality ?? 'Omani' } });
  if (reg.status !== 201) throw new Error(`captain register failed ${JSON.stringify(reg.body)}`);
  const id = reg.body.id as string;
  await q(pool, `UPDATE captains SET status = 'active', approved_at = now() WHERE id = $1`, [id]);
  const zones = opts.zones ?? ['MCT-KHUWAIR', 'MCT-QURUM', 'MCT-MSQ', 'MCT-GHUBRAH', 'MCT-BAWSHAR'];
  await q(pool, `INSERT INTO captain_zones (captain_id, zone_id) SELECT $1, id FROM zones WHERE code = ANY($2)`, [id, zones]);
  invalidateAuthCache(u.userId);
  if (opts.online !== false) {
    const s = await api('POST', '/captain/status', { token: u.token, body: { online: true, location: opts.location ?? KHUWAIR } });
    if (s.status !== 200) throw new Error(`go online failed ${JSON.stringify(s.body)}`);
  }
  return { ...u, captainId: id };
}

export async function consumerWithAddress(location = QURUM) {
  const u = await phoneLogin();
  const a = await api('POST', '/me/addresses', { token: u.token, body: { location, area: 'Qurum', landmark: 'White villa' } });
  return { ...u, addressId: a.body.id as string };
}

export async function pendingOffers(captainToken: string) {
  return (await api('GET', '/captain/offers', { token: captainToken })).body.items as any[];
}

export { pool, one, q };
