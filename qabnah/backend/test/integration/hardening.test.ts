import crypto from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';
import { apnsPayload, apnsProviderToken, fcmAssertion, fcmMessage, sendPush, toPushData, transports } from '../../src/integrations/push.js';
import { route } from '../../src/integrations/routing.js';
import { S3Storage } from '../../src/integrations/storage.js';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, timeStep, verifyTotp } from '../../src/lib/totp.js';
import { runDocumentExpiryReminders, runSubscriptionBilling } from '../../src/worker.js';
import { api, captain, consumerWithAddress, getApp, KHUWAIR, merchant, MSQ, one, pendingOffers, phoneLogin, pool, product, q, QURUM, resetDb, staff } from '../helpers/ctx.js';

beforeAll(resetDb);

describe('TOTP (RFC 6238 / 4226)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');
  it('matches the RFC 4226 / 6238 test vectors', () => {
    expect(hotp(rfcSecret, 0)).toBe('755224');
    expect(hotp(rfcSecret, 9)).toBe('520489');
    expect(hotp(rfcSecret, 1, 8)).toBe('94287082'); // RFC 6238, T = 59 s
    expect(hotp(rfcSecret, timeStep(1111111109 * 1000), 8)).toBe('07081804');
  });
  it('round-trips base32 and rejects replays', () => {
    const b32 = base32Encode(rfcSecret);
    expect(b32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(b32).equals(rfcSecret)).toBe(true);
    const now = Date.now();
    const code = hotp(rfcSecret, timeStep(now));
    const step = verifyTotp(b32, code, { now });
    expect(step).toBe(timeStep(now));
    expect(verifyTotp(b32, code, { now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(b32, '000000', { now })).toBeNull();
  });
  it('encrypts secrets at rest', () => {
    const blob = encryptSecret('SECRET', 'key');
    expect(blob).not.toContain('SECRET');
    expect(decryptSecret(blob, 'key')).toBe('SECRET');
    expect(() => decryptSecret(blob, 'other-key')).toThrow();
  });
});

const codeFor = (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), timeStep() + offsetSteps);

describe('admin multi-factor authentication', () => {
  it('enrolls, requires the second step at login, accepts recovery codes once', async () => {
    const s = await staff('ops_manager');
    const me = await api('GET', '/me', { token: s.token });
    expect(me.body.user.mfaEnabled).toBe(false);
    const setup = await api('POST', '/auth/mfa/setup', { token: s.token });
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Qabnah/);
    expect((await api('POST', '/auth/mfa/enable', { token: s.token, body: { code: '000000' } })).status).toBe(401);
    const en = await api('POST', '/auth/mfa/enable', { token: s.token, body: { code: codeFor(setup.body.secret) } });
    expect(en.status).toBe(200);
    expect(en.body.recoveryCodes).toHaveLength(10);
    // old (non-MFA) session was revoked; new tokens carry the second factor
    expect((await api('GET', '/me', { token: en.body.accessToken })).body.user.mfaEnabled).toBe(true);

    const login = await api('POST', '/auth/login', { body: { email: s.email, password: 'Test-Password-123' } });
    expect(login.body).toMatchObject({ mfaRequired: true });
    expect(login.body.accessToken).toBeUndefined();
    expect((await api('POST', '/auth/mfa/verify', { body: { mfaToken: login.body.mfaToken, code: '123456' } })).status).toBe(401);
    // the code used at enrolment cannot be replayed; the next step's code works
    const ok = await api('POST', '/auth/mfa/verify', { body: { mfaToken: login.body.mfaToken, code: codeFor(setup.body.secret, 1) } });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const rc = en.body.recoveryCodes[0];
    expect((await api('POST', '/auth/mfa/verify', { body: { mfaToken: login.body.mfaToken, recoveryCode: rc } })).status).toBe(200);
    expect((await api('POST', '/auth/mfa/verify', { body: { mfaToken: login.body.mfaToken, recoveryCode: rc } })).status).toBe(401);
    // an access token is not accepted as an MFA challenge token and vice versa
    expect((await api('POST', '/auth/mfa/verify', { body: { mfaToken: ok.body.accessToken, code: '000000' } })).status).toBe(401);
    expect((await api('GET', '/me', { token: login.body.mfaToken })).status).toBe(401);

    // super admin can reset another user's MFA (audited)
    const sa = await staff('super_admin');
    expect((await api('POST', `/admin/users/${s.userId}/mfa-reset`, { token: sa.token })).body.mfaEnabled).toBe(false);
    expect((await api('POST', '/auth/login', { body: { email: s.email, password: 'Test-Password-123' } })).body.accessToken).toBeTruthy();
  });

  it('when REQUIRE_ADMIN_MFA is on, platform permissions need a second factor; merchants and consumers are unaffected', async () => {
    const s = await staff('dispatcher');
    const m = await merchant();
    const c = await phoneLogin();
    (config as any).REQUIRE_ADMIN_MFA = true;
    try {
      const r = await api('GET', '/admin/operations/live', { token: s.token });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('mfa_enrollment_required');
      expect((await api('GET', '/me', { token: s.token })).body.security).toEqual({ mfaEnabled: false, sessionMfa: false, adminMfaRequired: true });
      const login = await api('POST', '/auth/login', { body: { email: s.email, password: 'Test-Password-123' } });
      expect(login.body.mfaEnrollmentRequired).toBe(true);
      const setup = await api('POST', '/auth/mfa/setup', { token: s.token });
      const en = await api('POST', '/auth/mfa/enable', { token: s.token, body: { code: codeFor(setup.body.secret) } });
      expect((await api('GET', '/admin/operations/live', { token: en.body.accessToken })).status).toBe(200);
      // MFA claim survives refresh
      const ref = await api('POST', '/auth/refresh', { body: { refreshToken: en.body.refreshToken } });
      expect((await api('GET', '/admin/operations/live', { token: ref.body.accessToken })).status).toBe(200);
      expect((await api('POST', '/auth/mfa/disable', { token: ref.body.accessToken, body: { code: codeFor(setup.body.secret, 1) } })).body.error.code).toBe('mfa_required_for_staff');
      expect((await api('GET', `/merchants/${m.merchantId}/orders`, { token: m.token })).status).toBe(200);
      expect((await api('GET', '/orders', { token: c.token })).status).toBe(200);
    } finally {
      (config as any).REQUIRE_ADMIN_MFA = false;
    }
  });
});

describe('push notifications', () => {
  it('signs FCM service-account assertions (RS256) and APNs provider tokens (ES256)', () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwt = fcmAssertion({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string }, 1_700_000_000);
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: 'svc@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging', exp: 1_700_003_600 });
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), rsa.publicKey, Buffer.from(sig, 'base64url'))).toBe(true);

    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const apns = apnsProviderToken(ec.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'KEY123', 'TEAM456', 1_700_000_000);
    const [ah, ap, asig] = apns.split('.');
    expect(JSON.parse(Buffer.from(ah, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(crypto.verify('SHA256', Buffer.from(`${ah}.${ap}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(asig, 'base64url'))).toBe(true);
  });

  it('builds platform payloads with deep-link data', () => {
    const data = toPushData('offer.created', { offerId: 'o1', deliveryId: 'd1', earning: 'OMR 1.000' });
    expect(data).toEqual({ type: 'offer.created', offerId: 'o1', deliveryId: 'd1' });
    expect(fcmMessage('tok', { title: 't', body: 'b', data }, 'captain').message.android.notification.channel_id).toBe('offers');
    expect(apnsPayload({ title: 't', body: 'b', data })).toMatchObject({ aps: { alert: { title: 't' }, 'interruption-level': 'time-sensitive' }, offerId: 'o1' });
  });

  it('routes by platform and removes tokens the provider reports as invalid', async () => {
    const u = await phoneLogin();
    await api('POST', '/me/devices', { token: u.token, body: { platform: 'android', app: 'consumer', token: 'fcm-token-invalid-123' } });
    await api('POST', '/me/devices', { token: u.token, body: { platform: 'ios', app: 'consumer', token: 'apns-token-good-12345' } });
    const orig = { ...transports };
    const calls: string[] = [];
    transports.fcm = async (d) => { calls.push(`fcm:${d.token}`); return 'invalid_token'; };
    transports.apns = async (d) => { calls.push(`apns:${d.token}`); return 'sent'; };
    (config as any).PUSH_PROVIDER = 'live';
    try {
      const r = await sendPush(u.userId, 'Hi', 'Body', { type: 'order.accepted', orderId: 'x' });
      expect(r.sort()).toEqual(['invalid_token', 'sent']);
      expect(calls.sort()).toEqual(['apns:apns-token-good-12345', 'fcm:fcm-token-invalid-123']);
      expect((await q(pool, `SELECT token FROM device_tokens WHERE user_id = $1`, [u.userId])).map((x) => x.token)).toEqual(['apns-token-good-12345']);
      expect((await api('POST', '/me/devices/unregister', { token: u.token, body: { token: 'apns-token-good-12345' } })).status).toBe(204);
      expect(await q(pool, `SELECT token FROM device_tokens WHERE user_id = $1`, [u.userId])).toEqual([]);
    } finally {
      Object.assign(transports, orig);
      (config as any).PUSH_PROVIDER = 'console';
    }
  });
});

describe('S3-compatible storage (against the s3rver emulator)', () => {
  let server: any;
  let dir: string;
  beforeAll(async () => {
    const S3rver = (await import('s3rver')).default;
    const fs = await import('node:fs');
    dir = fs.mkdtempSync('/tmp/qabnah-s3-');
    server = new S3rver({ port: 0, address: '127.0.0.1', silent: true, directory: dir, configureBuckets: [{ name: 'qabnah-test' }] } as any);
    const { port } = await server.run();
    Object.assign(config, { S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_ACCESS_KEY_ID: 'S3RVER', S3_SECRET_ACCESS_KEY: 'S3RVER', S3_FORCE_PATH_STYLE: true, S3_REGION: 'us-east-1' });
  });
  afterAll(async () => { await server?.close(); });

  it('puts, gets and deletes objects', async () => {
    const s3 = new S3Storage('qabnah-test');
    const data = crypto.randomBytes(2048);
    await s3.put('captain_document/ab/test.png', data);
    expect((await s3.get('captain_document/ab/test.png')).equals(data)).toBe(true);
    await s3.remove('captain_document/ab/test.png');
    await expect(s3.get('captain_document/ab/test.png')).rejects.toThrow();
  });
});

describe('road routing (OSRM with fallback)', () => {
  let srv: http.Server;
  let url = '';
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.url?.includes('/route/v1/driving/') ? { code: 'Ok', routes: [{ distance: 6400, duration: 540 }] } : { code: 'InvalidUrl' }));
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(srv.address() as any).port}`;
  });
  afterAll(() => { srv.close(); (config as any).ROUTING_PROVIDER = 'haversine'; });

  it('uses OSRM when configured, keeps the bike floor, and falls back when OSRM is down', async () => {
    Object.assign(config, { ROUTING_PROVIDER: 'osrm', OSRM_URL: url });
    expect(await route(KHUWAIR, QURUM, 'car')).toEqual({ distanceM: 6400, durationS: 660, source: 'osrm' });
    const bike = await route(KHUWAIR, QURUM, 'bike');
    expect(bike.source).toBe('osrm');
    expect(bike.distanceM).toBeGreaterThan(6400); // haversine bike factor is the floor
    Object.assign(config, { OSRM_URL: 'http://127.0.0.1:1' });
    expect((await route(KHUWAIR, QURUM, 'car')).source).toBe('haversine');
    // quotes keep working through the provider
    Object.assign(config, { OSRM_URL: url });
    const qte = await api('POST', '/quotes/delivery', { body: { type: 'c2c', pickup: MSQ, dropoff: QURUM } });
    expect(qte.body.distanceM).toBe(6400);
    (config as any).ROUTING_PROVIDER = 'haversine';
  });
});

describe('invoice', () => {
  it('provides a signed bilingual invoice once delivered, hidden from captains', async () => {
    await q(pool, `UPDATE captains SET is_online = false`);
    const m = await merchant({ location: KHUWAIR });
    const p = await product(m, { optionGroups: [], basePriceBaisa: 2500, nameEn: 'Mixed Grill', nameAr: 'مشويات مشكلة' });
    const cap = await captain({ location: KHUWAIR });
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 2 }], addressId: c.addressId, paymentMethod: 'cod' } })).body;
    expect(o.invoiceUrl).toBeNull();
    await api('POST', `/merchants/${m.merchantId}/orders/${o.id}/accept`, { token: m.token, body: {} });
    const [offer] = await pendingOffers(cap.token);
    await api('POST', `/captain/offers/${offer.id}/accept`, { token: cap.token });
    await api('POST', `/captain/deliveries/${o.delivery.id}/status`, { token: cap.token, body: { action: 'pickup' } });
    await api('POST', `/captain/deliveries/${o.delivery.id}/complete`, { token: cap.token, body: { pin: o.delivery.deliveryPin } });
    const after = (await api('GET', `/orders/${o.id}`, { token: c.token })).body;
    expect(after.invoiceUrl).toContain(`/v1/invoices/${o.id}?exp=`);
    expect((await api('GET', `/merchants/${m.merchantId}/orders/${o.id}`, { token: m.token })).body.invoiceUrl).toBeTruthy();
    const app = await getApp();
    const inv = await app.inject({ method: 'GET', url: after.invoiceUrl.replace(/^https?:\/\/[^/]+/, '') });
    expect(inv.statusCode).toBe(200);
    expect(inv.body).toContain(o.number);
    expect(inv.body).toContain('فاتورة ضريبية مبسطة');
    expect(inv.body).toContain('مشويات مشكلة');
    expect(inv.body).toContain((after.totalBaisa / 1000).toFixed(3));
    const tampered = await app.inject({ method: 'GET', url: after.invoiceUrl.replace(/^https?:\/\/[^/]+/, '').replace(/sig=./, 'sig=0') });
    expect(tampered.statusCode).toBe(403);
  });
});

describe('privacy: data export and account deletion', () => {
  it('exports personal data and deletes the account once nothing is in progress', async () => {
    const m = await merchant({ location: KHUWAIR });
    const p = await product(m, { optionGroups: [], basePriceBaisa: 1000 });
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 1 }], addressId: c.addressId, paymentMethod: 'cod' } })).body;
    const exp = await api('GET', '/me/export', { token: c.token });
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toContain('attachment');
    expect(exp.body.user.phone).toBe(c.phone);
    expect(exp.body.orders[0].number).toBe(o.number);
    expect(exp.body.addresses).toHaveLength(1);

    expect((await api('POST', '/me/delete', { token: c.token, body: { confirm: 'yes' } })).status).toBe(400);
    const blocked = await api('POST', '/me/delete', { token: c.token, body: { confirm: 'DELETE' } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('account_deletion_blocked');
    await api('POST', `/orders/${o.id}/cancel`, { token: c.token, body: {} });
    expect((await api('POST', '/me/delete', { token: c.token, body: { confirm: 'DELETE' } })).status).toBe(204);
    expect((await api('GET', '/me', { token: c.token })).status).toBe(401);
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: c.refreshToken } })).status).toBe(401);
    const row = await one(pool, `SELECT phone, full_name, status FROM users WHERE id = $1`, [c.userId]);
    expect(row).toEqual({ phone: null, full_name: 'Deleted user', status: 'deleted' });
    const order = await one(pool, `SELECT customer_name, customer_phone FROM orders WHERE id = $1`, [o.id]);
    expect(order).toEqual({ customer_name: 'Deleted user', customer_phone: null });
    // the same phone can sign up again as a brand-new account (after the 30 s OTP resend cooldown)
    await q(pool, `UPDATE otp_codes SET created_at = created_at - interval '1 minute' WHERE phone = $1`, [c.phone]);
    const again = await phoneLogin(c.phone);
    expect(again.userId).not.toBe(c.userId);
    // store staff cannot self-delete
    expect((await api('POST', '/me/delete', { token: m.token, body: { confirm: 'DELETE' } })).status).toBe(409);
  });

  it('blocks captain deletion while a cash balance is unsettled', async () => {
    const cap = await captain({ location: KHUWAIR, online: false });
    await q(pool, `INSERT INTO ledger_entries (account_type, account_id, entry_type, amount_baisa, description) VALUES ('captain',$1,'cod_collected',-5000,'test')`, [cap.captainId]);
    const r = await api('POST', '/me/delete', { token: cap.token, body: { confirm: 'DELETE' } });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/balance must be settled/);
  });
});

describe('scheduled jobs', () => {
  it('bills monthly subscription fees once per period', async () => {
    const m = await merchant();
    const plan = await one(pool, `SELECT id, monthly_fee_baisa FROM subscription_plans WHERE code = 'growth'`);
    await q(pool, `UPDATE merchant_subscriptions SET status = 'cancelled' WHERE merchant_id = $1`, [m.merchantId]);
    await q(pool, `INSERT INTO merchant_subscriptions (merchant_id, plan_id, current_period_end) VALUES ($1,$2, now() - interval '1 day')`, [m.merchantId, plan.id]);
    expect(await runSubscriptionBilling()).toBeGreaterThanOrEqual(1);
    const fin = (await api('GET', `/merchants/${m.merchantId}/finance`, { token: m.token })).body;
    expect(fin.balanceBaisa).toBe(-plan.monthly_fee_baisa);
    expect(fin.unsettledEntries[0].entryType).toBe('subscription_fee');
    await runSubscriptionBilling();
    expect((await api('GET', `/merchants/${m.merchantId}/finance`, { token: m.token })).body.balanceBaisa).toBe(-plan.monthly_fee_baisa);
    const sub = await one(pool, `SELECT current_period_end > now() AS future FROM merchant_subscriptions WHERE merchant_id = $1 AND status = 'active'`, [m.merchantId]);
    expect(sub.future).toBe(true);
  });

  it('reminds captains once before a document expires', async () => {
    const cap = await captain({ online: false });
    const f = await one(pool, `INSERT INTO files (owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256) VALUES ($1,'captain_document',$2,'image/png',1,'x') RETURNING id`, [cap.userId, `k-${Date.now()}`]);
    await q(pool, `INSERT INTO captain_documents (captain_id, doc_type, file_id, status, expires_at) VALUES ($1,'driving_license',$2,'approved', current_date + 5)`, [cap.captainId, f.id]);
    expect(await runDocumentExpiryReminders()).toBeGreaterThanOrEqual(1);
    const n = (await api('GET', '/me/notifications', { token: cap.token })).body.items;
    expect(n[0].type).toBe('captain.document_expiring');
    const before = n.length;
    await runDocumentExpiryReminders();
    expect((await api('GET', '/me/notifications', { token: cap.token })).body.items.length).toBe(before);
  });
});
