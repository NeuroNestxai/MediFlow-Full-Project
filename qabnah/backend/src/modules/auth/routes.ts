import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool, one, q, tx } from '../../db/pool.js';
import { sendSms } from '../../integrations/sms.js';
import { randomDigits, safeEqual, sha256, shortCode } from '../../lib/crypto.js';
import { audit, invalidateAuthCache, requireAuth, signMfaChallenge, verifyMfaChallenge } from '../../lib/auth.js';
import { decryptSecret, encryptSecret, newTotpSecret, otpauthUrl, verifyTotp } from '../../lib/totp.js';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { normalizeOmanPhone } from '../../lib/phone.js';
import { parse, zLatLng } from '../../lib/validate.js';
import { zoneForPoint } from '../core/zones.js';
import { userDto } from '../users/dto.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken } from './tokens.js';

const OTP_TTL_S = 300;
const OTP_MAX_ATTEMPTS = 5;
const otpHash = (phone: string, code: string) => sha256(`${config.OTP_PEPPER}:${phone}:${code}`);

export default async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/otp/request', strict, async (req) => {
    const body = parse(z.object({ phone: z.string() }), req.body);
    const phone = normalizeOmanPhone(body.phone);
    const recent = await one(
      pool,
      `SELECT count(*)::int AS n, max(created_at) AS last FROM otp_codes WHERE phone = $1 AND created_at > now() - interval '15 minutes'`,
      [phone],
    );
    if (recent.n >= 5) throw new AppError(429, 'rate_limited', 'Too many codes requested. Try again later.');
    if (recent.last && Date.now() - new Date(recent.last).getTime() < 30_000)
      throw new AppError(429, 'rate_limited', 'Please wait 30 seconds before requesting another code.');
    const code = randomDigits(6);
    await q(pool, `INSERT INTO otp_codes (phone, code_hash, expires_at, ip) VALUES ($1,$2, now() + interval '${OTP_TTL_S} seconds', $3)`, [phone, otpHash(phone, code), req.ip]);
    await sendSms(phone, `Qabnah code: ${code}. رمز قبناه: ${code}`, { logBody: false });
    return { sent: true, expiresInSeconds: OTP_TTL_S, ...(config.OTP_DEV_ECHO ? { devCode: code } : {}) };
  });

  app.post('/auth/otp/verify', strict, async (req) => {
    const body = parse(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/), fullName: z.string().trim().max(100).optional() }), req.body);
    const phone = normalizeOmanPhone(body.phone);
    // Failed attempts must be persisted, so the transaction returns an error value instead of throwing (a throw would roll back the counter).
    const result = await tx(async (c) => {
      const otp = await one(
        c,
        `SELECT * FROM otp_codes WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [phone],
      );
      if (!otp) return { error: new AppError(401, 'invalid_code', 'The code is invalid or has expired') };
      if (otp.attempts >= OTP_MAX_ATTEMPTS) return { error: new AppError(401, 'too_many_attempts', 'Too many attempts. Request a new code.') };
      if (!safeEqual(otp.code_hash, otpHash(phone, body.code))) {
        await q(c, `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
        return { error: new AppError(401, 'invalid_code', 'The code is invalid or has expired') };
      }
      await q(c, `UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [otp.id]);
      let user = await one(c, `SELECT * FROM users WHERE phone = $1`, [phone]);
      let isNewUser = false;
      if (!user) {
        user = await one(c, `INSERT INTO users (phone, full_name) VALUES ($1, $2) RETURNING *`, [phone, body.fullName ?? '']);
        isNewUser = true;
      } else if (user.status !== 'active') {
        return { error: forbidden('This account is suspended. Contact support.') };
      } else if (!user.full_name && body.fullName) {
        user = await one(c, `UPDATE users SET full_name = $2 WHERE id = $1 RETURNING *`, [user.id, body.fullName]);
      }
      const tokens = await issueTokens(c, user.id, req.headers['user-agent']);
      return { ok: { ...tokens, user: userDto(user), isNewUser } };
    });
    if ('error' in result) throw result.error;
    return result.ok;
  });

  app.post('/auth/login', strict, async (req) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const user = await one(pool, `SELECT * FROM users WHERE email = $1`, [body.email]);
    const ok = !!user?.password_hash && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) throw unauthorized('Email or password is incorrect');
    if (user.status !== 'active') throw forbidden('This account is suspended. Contact support.');
    if (user.totp_enabled_at) {
      // Second step required: no tokens until /auth/mfa/verify succeeds.
      return { mfaRequired: true, mfaToken: await signMfaChallenge(user.id) };
    }
    const tokens = await issueTokens(pool, user.id, req.headers['user-agent']);
    const staff = await one(pool, `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.scope = 'platform' LIMIT 1`, [user.id]);
    return { ...tokens, user: userDto(user), isNewUser: false, mfaEnrollmentRequired: !!staff && config.REQUIRE_ADMIN_MFA };
  });

  // ── Multi-factor authentication (TOTP, RFC 6238) ──
  app.post('/auth/mfa/verify', strict, async (req) => {
    const b = parse(z.object({ mfaToken: z.string(), code: z.string().optional(), recoveryCode: z.string().optional() }).refine((x) => x.code || x.recoveryCode, { message: 'code or recoveryCode is required' }), req.body);
    const userId = await verifyMfaChallenge(b.mfaToken);
    const result = await tx(async (c) => {
      const u = await one(c, `SELECT * FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!u || u.status !== 'active' || !u.totp_enabled_at) return { error: unauthorized('Two-factor authentication is not available for this account') };
      if (b.code) {
        const step = verifyTotp(decryptSecret(u.totp_secret_enc, config.MFA_ENCRYPTION_KEY), b.code, { lastUsedStep: u.totp_last_step });
        if (step == null) return { error: new AppError(401, 'invalid_code', 'The authenticator code is incorrect') };
        await q(c, `UPDATE users SET totp_last_step = $2 WHERE id = $1`, [userId, step]);
      } else {
        const hash = sha256(`${config.MFA_ENCRYPTION_KEY}:${b.recoveryCode!.replace(/[\s-]/g, '').toUpperCase()}`);
        const rc = await q(c, `UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`, [userId, hash]);
        if (!rc.length) return { error: new AppError(401, 'invalid_code', 'The recovery code is invalid or already used') };
      }
      await audit(c, null, b.code ? 'auth.mfa_verified' : 'auth.mfa_recovery_code_used', 'user', userId);
      return { ok: { ...(await issueTokens(c, userId, req.headers['user-agent'], undefined, true)), user: userDto(u), isNewUser: false } };
    });
    if ('error' in result) throw result.error;
    return result.ok;
  });

  app.post('/auth/mfa/setup', async (req) => {
    const auth = requireAuth(req);
    const u = await one(pool, `SELECT email, password_hash, totp_enabled_at FROM users WHERE id = $1`, [auth.userId]);
    if (!u.password_hash) throw forbidden('Two-factor authentication is for e-mail/password accounts');
    if (u.totp_enabled_at) throw conflict('Two-factor authentication is already enabled', 'mfa_already_enabled');
    const secret = newTotpSecret();
    await q(pool, `UPDATE users SET totp_secret_enc = $2 WHERE id = $1`, [auth.userId, encryptSecret(secret, config.MFA_ENCRYPTION_KEY)]);
    return { secret, otpauthUrl: otpauthUrl(secret, u.email) };
  });

  app.post('/auth/mfa/enable', strict, async (req) => {
    const auth = requireAuth(req);
    const b = parse(z.object({ code: z.string() }), req.body);
    const out = await tx(async (c) => {
      const u = await one(c, `SELECT * FROM users WHERE id = $1 FOR UPDATE`, [auth.userId]);
      if (u.totp_enabled_at) return { error: conflict('Two-factor authentication is already enabled', 'mfa_already_enabled') };
      if (!u.totp_secret_enc) return { error: badRequest('Call /auth/mfa/setup first') };
      const step = verifyTotp(decryptSecret(u.totp_secret_enc, config.MFA_ENCRYPTION_KEY), b.code);
      if (step == null) return { error: new AppError(401, 'invalid_code', 'The authenticator code is incorrect') };
      await q(c, `UPDATE users SET totp_enabled_at = now(), totp_last_step = $2 WHERE id = $1`, [auth.userId, step]);
      await q(c, `DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [auth.userId]);
      const codes = Array.from({ length: 10 }, () => shortCode(10));
      for (const rc of codes) await q(c, `INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1,$2)`, [auth.userId, sha256(`${config.MFA_ENCRYPTION_KEY}:${rc}`)]);
      // Other sessions were opened without a second factor: revoke them.
      await q(c, `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [auth.userId]);
      await audit(c, req, 'auth.mfa_enabled', 'user', auth.userId);
      return { ok: { recoveryCodes: codes.map((x) => `${x.slice(0, 5)}-${x.slice(5)}`), ...(await issueTokens(c, auth.userId, req.headers['user-agent'], undefined, true)) } };
    });
    invalidateAuthCache(auth.userId);
    if ('error' in out) throw out.error;
    return out.ok;
  });

  app.post('/auth/mfa/disable', strict, async (req) => {
    const auth = requireAuth(req);
    const b = parse(z.object({ code: z.string() }), req.body);
    if (config.REQUIRE_ADMIN_MFA && auth.roles.some((r) => !r.merchantId && !['consumer', 'captain'].includes(r.key)))
      throw conflict('Platform staff must keep two-factor authentication enabled', 'mfa_required_for_staff');
    const out = await tx(async (c) => {
      const u = await one(c, `SELECT * FROM users WHERE id = $1 FOR UPDATE`, [auth.userId]);
      if (!u.totp_enabled_at) return { error: conflict('Two-factor authentication is not enabled', 'mfa_not_enabled') };
      if (verifyTotp(decryptSecret(u.totp_secret_enc, config.MFA_ENCRYPTION_KEY), b.code, { lastUsedStep: u.totp_last_step }) == null)
        return { error: new AppError(401, 'invalid_code', 'The authenticator code is incorrect') };
      await q(c, `UPDATE users SET totp_enabled_at = NULL, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = $1`, [auth.userId]);
      await q(c, `DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [auth.userId]);
      await audit(c, req, 'auth.mfa_disabled', 'user', auth.userId);
      return { ok: true };
    });
    invalidateAuthCache(auth.userId);
    if ('error' in out) throw out.error;
    return { mfaEnabled: false };
  });

  // Refresh is called by every open tab/app; give it a looser limit than sign-in.
  app.post('/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    const r = await tx((c) => rotateRefreshToken(c, body.refreshToken, req.headers['user-agent']));
    if ('error' in r) throw r.error;
    return r.tokens;
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = parse(z.object({ refreshToken: z.string().optional() }), req.body);
    if (body.refreshToken) await revokeRefreshToken(pool, body.refreshToken);
    reply.code(204);
  });

  app.post('/merchants/register', strict, async (req, reply) => {
    const body = parse(
      z.object({
        email: z.string().email(),
        password: z.string().min(10, 'Password must be at least 10 characters'),
        fullName: z.string().trim().min(2),
        phone: z.string().optional(),
        merchant: z.object({
          nameEn: z.string().trim().min(2),
          nameAr: z.string().trim().min(2),
          slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, 'lowercase letters, digits and dashes'),
          category: z.enum(['restaurant', 'cafe', 'grocery', 'pharmacy', 'retail', 'flowers', 'electronics', 'other']),
          location: zLatLng,
          addressText: z.string().optional(),
          crNumber: z.string().optional(),
          contactPhone: z.string().optional(),
        }),
      }),
      req.body,
    );
    const phone = body.phone ? normalizeOmanPhone(body.phone) : null;
    const contactPhone = body.merchant.contactPhone ? normalizeOmanPhone(body.merchant.contactPhone) : phone;
    const result = await tx(async (c) => {
      if (await one(c, `SELECT 1 FROM users WHERE email = $1`, [body.email])) throw conflict('An account with this email already exists', 'email_taken');
      if (phone && (await one(c, `SELECT 1 FROM users WHERE phone = $1`, [phone]))) throw conflict('An account with this phone already exists', 'phone_taken');
      if (await one(c, `SELECT 1 FROM merchants WHERE slug = $1`, [body.merchant.slug])) throw conflict('This store address is taken', 'slug_taken');
      const hash = await bcrypt.hash(body.password, 12);
      const user = await one(c, `INSERT INTO users (email, phone, password_hash, full_name) VALUES ($1,$2,$3,$4) RETURNING *`, [body.email, phone, hash, body.fullName]);
      const zone = await zoneForPoint(c, body.merchant.location);
      const plan = await one(c, `SELECT id FROM subscription_plans WHERE code = 'starter' AND is_active`);
      const m = body.merchant;
      const merchant = await one(
        c,
        `INSERT INTO merchants (slug, name_en, name_ar, category, location, address_text, zone_id, plan_id, cr_number, contact_phone, contact_email, whatsapp_phone)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, $7,$8,$9,$10,$11,$12,$11) RETURNING id`,
        [m.slug, m.nameEn, m.nameAr, m.category, m.location.lng, m.location.lat, m.addressText ?? '', zone?.id ?? null, plan?.id ?? null, m.crNumber ?? null, contactPhone, body.email],
      );
      await q(c, `INSERT INTO user_roles (user_id, role_id, merchant_id) SELECT $1, id, $2 FROM roles WHERE key = 'merchant_owner'`, [user.id, merchant.id]);
      if (plan) await q(c, `INSERT INTO merchant_subscriptions (merchant_id, plan_id, current_period_end) VALUES ($1,$2, now() + interval '1 month')`, [merchant.id, plan.id]);
      const tokens = await issueTokens(c, user.id, req.headers['user-agent']);
      return { ...tokens, user: userDto(user), isNewUser: true, merchantId: merchant.id };
    });
    reply.code(201);
    return result;
  });
}
