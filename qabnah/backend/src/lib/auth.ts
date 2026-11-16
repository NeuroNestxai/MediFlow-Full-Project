import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { pool, q, one, type Queryable } from '../db/pool.js';
import { forbidden, unauthorized } from './errors.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);

export interface AuthContext {
  userId: string;
  fullName: string;
  phone: string | null;
  roles: { key: string; merchantId: string | null }[];
  permissions: Set<string>; // platform scope
  merchantPerms: Map<string, Set<string>>;
  captainId: string | null;
  captainStatus: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('qabnah')
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_S}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'qabnah' });
    if (!payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

const cache = new Map<string, { at: number; ctx: AuthContext }>();
const CACHE_MS = 30_000;
export const invalidateAuthCache = (userId?: string) => (userId ? cache.delete(userId) : cache.clear());

export async function loadAuthContext(userId: string, db: Queryable = pool): Promise<AuthContext> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ctx;
  const user = await one(db, `SELECT id, full_name, phone, status FROM users WHERE id = $1`, [userId]);
  if (!user || user.status !== 'active') throw unauthorized('Account is not active');
  const rows = await q(
    db,
    `SELECT r.key, ur.merchant_id, r.scope, rp.permission_key
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE ur.user_id = $1`,
    [userId],
  );
  const roles = new Map<string, { key: string; merchantId: string | null }>();
  const permissions = new Set<string>();
  const merchantPerms = new Map<string, Set<string>>();
  for (const r of rows) {
    roles.set(`${r.key}:${r.merchant_id ?? ''}`, { key: r.key, merchantId: r.merchant_id });
    if (!r.permission_key) continue;
    if (r.scope === 'merchant' && r.merchant_id) {
      if (!merchantPerms.has(r.merchant_id)) merchantPerms.set(r.merchant_id, new Set());
      merchantPerms.get(r.merchant_id)!.add(r.permission_key);
    } else if (r.scope === 'platform') permissions.add(r.permission_key);
  }
  const captain = await one(db, `SELECT id, status FROM captains WHERE user_id = $1`, [userId]);
  const ctx: AuthContext = {
    userId,
    fullName: user.full_name,
    phone: user.phone,
    roles: [...roles.values()],
    permissions,
    merchantPerms,
    captainId: captain?.id ?? null,
    captainStatus: captain?.status ?? null,
  };
  cache.set(userId, { at: Date.now(), ctx });
  return ctx;
}

export async function authenticate(req: FastifyRequest): Promise<void> {
  req.auth = null;
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return;
  const userId = await verifyAccessToken(h.slice(7));
  req.auth = await loadAuthContext(userId);
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function hasPerm(ctx: AuthContext | null, perm: string): boolean {
  return !!ctx && ctx.permissions.has(perm);
}

export function requirePerm(req: FastifyRequest, ...perms: string[]): AuthContext {
  const ctx = requireAuth(req);
  if (!perms.some((p) => ctx.permissions.has(p))) throw forbidden();
  return ctx;
}

export function hasMerchantPerm(ctx: AuthContext | null, merchantId: string, perm: string): boolean {
  if (!ctx) return false;
  if (ctx.merchantPerms.get(merchantId)?.has(perm)) return true;
  // Platform staff with merchants:manage may act on behalf of a store (support access; audited by caller).
  return ctx.permissions.has('merchants:manage');
}

export function requireMerchantPerm(req: FastifyRequest, merchantId: string, perm: string): AuthContext {
  const ctx = requireAuth(req);
  if (!hasMerchantPerm(ctx, merchantId, perm)) throw forbidden();
  return ctx;
}

export function requireCaptain(req: FastifyRequest, opts: { active?: boolean } = {}): AuthContext & { captainId: string } {
  const ctx = requireAuth(req);
  if (!ctx.captainId) throw forbidden('Captain profile required');
  if (opts.active && ctx.captainStatus !== 'active') throw forbidden('Captain account is not active');
  return ctx as AuthContext & { captainId: string };
}

export async function audit(db: Queryable, req: FastifyRequest | null, action: string, entityType: string, entityId: string | null, data: unknown = {}) {
  await q(db, `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, data, ip) VALUES ($1,$2,$3,$4,$5,$6)`, [
    req?.auth?.userId ?? null,
    action,
    entityType,
    entityId,
    JSON.stringify(data ?? {}),
    req?.ip ?? null,
  ]);
}
