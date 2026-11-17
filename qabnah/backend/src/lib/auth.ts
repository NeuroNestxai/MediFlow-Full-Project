import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { pool, q, one, type Queryable } from '../db/pool.js';
import { AppError, forbidden, unauthorized } from './errors.js';

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
  /** True when this access token was issued after a second factor (TOTP / recovery code). */
  mfa: boolean;
  mfaEnabled: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function signAccessToken(userId: string, opts: { mfa?: boolean } = {}): Promise<string> {
  return new SignJWT(opts.mfa ? { amr: ['pwd', 'otp'] } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('qabnah')
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_S}s`)
    .sign(secret);
}

export async function verifyAccessTokenClaims(token: string): Promise<{ userId: string; mfa: boolean }> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'qabnah' });
    if (!payload.sub || payload.typ) throw new Error('not an access token');
    return { userId: payload.sub, mfa: Array.isArray(payload.amr) && payload.amr.includes('otp') };
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export async function verifyAccessToken(token: string): Promise<string> {
  return (await verifyAccessTokenClaims(token)).userId;
}

/** Short-lived token proving the password step passed; exchanged at /auth/mfa/verify. */
export async function signMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ typ: 'mfa_challenge' }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setIssuer('qabnah').setExpirationTime('5m').sign(secret);
}

export async function verifyMfaChallenge(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'qabnah' });
    if (payload.typ !== 'mfa_challenge' || !payload.sub) throw new Error('wrong type');
    return payload.sub;
  } catch {
    throw unauthorized('The sign-in step expired; sign in again');
  }
}

const cache = new Map<string, { at: number; ctx: AuthContext }>();
const CACHE_MS = 30_000;
export const invalidateAuthCache = (userId?: string) => (userId ? cache.delete(userId) : cache.clear());

export async function loadAuthContext(userId: string, db: Queryable = pool, mfa = false): Promise<AuthContext> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.ctx, mfa };
  const user = await one(db, `SELECT id, full_name, phone, status, totp_enabled_at FROM users WHERE id = $1`, [userId]);
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
    mfa: false,
    mfaEnabled: !!user.totp_enabled_at,
  };
  cache.set(userId, { at: Date.now(), ctx });
  return { ...ctx, mfa };
}

export async function authenticate(req: FastifyRequest): Promise<void> {
  req.auth = null;
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return;
  const { userId, mfa } = await verifyAccessTokenClaims(h.slice(7));
  req.auth = await loadAuthContext(userId, pool, mfa);
}

/** Platform (admin) permissions need a second factor when REQUIRE_ADMIN_MFA is on. */
function assertPlatformMfa(ctx: AuthContext) {
  if (config.REQUIRE_ADMIN_MFA && !ctx.mfa) {
    throw new AppError(403, ctx.mfaEnabled ? 'mfa_required' : 'mfa_enrollment_required',
      ctx.mfaEnabled ? 'Sign in again with your authenticator code' : 'Set up two-factor authentication to use the admin panel');
  }
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function hasPerm(ctx: AuthContext | null, perm: string): boolean {
  return !!ctx && ctx.permissions.has(perm) && (!config.REQUIRE_ADMIN_MFA || ctx.mfa);
}

export function requirePerm(req: FastifyRequest, ...perms: string[]): AuthContext {
  const ctx = requireAuth(req);
  if (!perms.some((p) => ctx.permissions.has(p))) throw forbidden();
  assertPlatformMfa(ctx);
  return ctx;
}

export function hasMerchantPerm(ctx: AuthContext | null, merchantId: string, perm: string): boolean {
  if (!ctx) return false;
  if (ctx.merchantPerms.get(merchantId)?.has(perm)) return true;
  // Platform staff with merchants:manage may act on behalf of a store (support access; audited by caller).
  return ctx.permissions.has('merchants:manage') && (!config.REQUIRE_ADMIN_MFA || ctx.mfa);
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
