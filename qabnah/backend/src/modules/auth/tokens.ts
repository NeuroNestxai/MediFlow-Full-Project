import crypto from 'node:crypto';
import { config } from '../../config.js';
import { one, q, type Queryable } from '../../db/pool.js';
import { signAccessToken } from '../../lib/auth.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { unauthorized } from '../../lib/errors.js';

export async function issueTokens(db: Queryable, userId: string, userAgent?: string, familyId: string = crypto.randomUUID()) {
  const refreshToken = randomToken(48);
  await q(db, `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3, now() + ($4 || ' days')::interval, $5)`, [
    userId,
    familyId,
    sha256(refreshToken),
    String(config.REFRESH_TOKEN_TTL_DAYS),
    userAgent?.slice(0, 200) ?? null,
  ]);
  await q(db, `UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  return { accessToken: await signAccessToken(userId), refreshToken, expiresIn: config.ACCESS_TOKEN_TTL_S };
}

export async function rotateRefreshToken(db: Queryable, token: string, userAgent?: string) {
  const row = await one(db, `SELECT rt.*, u.status AS user_status FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE token_hash = $1`, [sha256(token)]);
  if (!row) throw unauthorized('Invalid refresh token');
  if (row.revoked_at) {
    // Reuse of a rotated token: assume theft, revoke the whole family.
    await q(db, `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [row.family_id]);
    throw unauthorized('Refresh token reuse detected; please sign in again');
  }
  if (new Date(row.expires_at) < new Date()) throw unauthorized('Refresh token expired');
  if (row.user_status !== 'active') throw unauthorized('Account is not active');
  const tokens = await issueTokens(db, row.user_id, userAgent, row.family_id);
  const created = await one(db, `SELECT id FROM refresh_tokens WHERE token_hash = $1`, [sha256(tokens.refreshToken)]);
  await q(db, `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [row.id, created!.id]);
  return tokens;
}

export async function revokeRefreshToken(db: Queryable, token: string) {
  await q(db, `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [sha256(token)]);
}
