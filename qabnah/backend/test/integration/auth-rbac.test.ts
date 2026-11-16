import { beforeAll, describe, expect, it } from 'vitest';
import { api, captain, merchant, nextPhone, phoneLogin, pool, q, resetDb, staff } from '../helpers/ctx.js';

beforeAll(resetDb);

describe('phone OTP authentication', () => {
  it('creates a user on first verification and signs in again later', async () => {
    const phone = nextPhone();
    const a = await phoneLogin(phone, 'Maryam');
    const me = await api('GET', '/me', { token: a.token });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ phone, fullName: 'Maryam', locale: 'ar' });
    expect(me.body.captain).toBeNull();
    // second login reuses the account
    await q(pool, `UPDATE otp_codes SET created_at = created_at - interval '1 minute' WHERE phone = $1`, [phone]);
    const b = await phoneLogin(phone);
    expect(b.userId).toBe(a.userId);
  });

  it('rejects wrong codes and locks after 5 attempts', async () => {
    const phone = nextPhone();
    const r = await api('POST', '/auth/otp/request', { body: { phone } });
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await api('POST', '/auth/otp/verify', { body: { phone, code: wrong } })).status).toBe(401);
    const locked = await api('POST', '/auth/otp/verify', { body: { phone, code: r.body.devCode } });
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('too_many_attempts');
  });

  it('throttles repeated code requests', async () => {
    const phone = nextPhone();
    expect((await api('POST', '/auth/otp/request', { body: { phone } })).status).toBe(200);
    const again = await api('POST', '/auth/otp/request', { body: { phone } });
    expect(again.status).toBe(429);
  });

  it('validates Omani mobile format', async () => {
    const r = await api('POST', '/auth/otp/request', { body: { phone: '24123456' } });
    expect(r.status).toBe(400);
  });
});

describe('refresh tokens', () => {
  it('rotates and detects reuse of an old token', async () => {
    const a = await phoneLogin();
    const r1 = await api('POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(a.refreshToken);
    // reuse of the rotated token → whole family revoked
    const reuse = await api('POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } });
    expect(reuse.status).toBe(401);
    const r2 = await api('POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
    expect(r2.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const a = await phoneLogin();
    expect((await api('POST', '/auth/logout', { token: a.token, body: { refreshToken: a.refreshToken } })).status).toBe(204);
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } })).status).toBe(401);
  });
});

describe('staff login and account status', () => {
  it('signs in with email/password and returns permissions', async () => {
    const s = await staff('dispatcher');
    const me = await api('GET', '/me', { token: s.token });
    expect(me.body.permissions).toContain('deliveries:dispatch');
    expect(me.body.permissions).not.toContain('pricing:manage');
  });

  it('does not reveal which credential was wrong', async () => {
    const s = await staff('analyst');
    const bad = await api('POST', '/auth/login', { body: { email: s.email, password: 'nope-nope-nope' } });
    const unknown = await api('POST', '/auth/login', { body: { email: 'nobody@qabnah.test', password: 'nope-nope-nope' } });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('suspended users lose access immediately', async () => {
    const admin = await staff('super_admin');
    const u = await phoneLogin();
    expect((await api('POST', `/admin/users/${u.userId}/status`, { token: admin.token, body: { status: 'suspended' } })).status).toBe(200);
    expect((await api('GET', '/me', { token: u.token })).status).toBe(401);
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: u.refreshToken } })).status).toBe(401);
  });
});

describe('role-based access control', () => {
  it('dispatcher cannot edit pricing; finance manager can', async () => {
    const d = await staff('dispatcher');
    const fm = await staff('finance_manager');
    const body = { name: 'Test rule', baseFeeBaisa: 500, perKmBaisa: 100 };
    expect((await api('POST', '/admin/pricing-rules', { token: d.token, body })).status).toBe(403);
    expect((await api('POST', '/admin/pricing-rules', { token: fm.token, body })).status).toBe(201);
  });

  it('support agent cannot approve captains; reviewer can reach the endpoint', async () => {
    const sa = await staff('support_agent');
    const rv = await staff('onboarding_reviewer');
    const c = await captain({ online: false });
    await q(pool, `UPDATE captains SET status = 'pending_review' WHERE id = $1`, [c.captainId]);
    expect((await api('POST', `/admin/captains/${c.captainId}/approve`, { token: sa.token, body: {} })).status).toBe(403);
    const r = await api('POST', `/admin/captains/${c.captainId}/approve`, { token: rv.token, body: {} });
    expect(r.status).toBe(409); // reached business rules: documents not approved yet
    expect(r.body.error.code).toBe('documents_incomplete');
  });

  it('merchant staff of store A cannot read store B', async () => {
    const a = await merchant();
    const b = await merchant();
    expect((await api('GET', `/merchants/${a.merchantId}/orders`, { token: a.token })).status).toBe(200);
    expect((await api('GET', `/merchants/${b.merchantId}/orders`, { token: a.token })).status).toBe(403);
    expect((await api('PATCH', `/merchants/${b.merchantId}`, { token: a.token, body: { isOpen: false } })).status).toBe(403);
  });

  it('merchant_staff can process orders but cannot manage staff or catalog', async () => {
    const m = await merchant();
    const add = await api('POST', `/merchants/${m.merchantId}/staff`, { token: m.token, body: { email: `cashier.${Date.now()}@qabnah.test`, fullName: 'Cashier', role: 'merchant_staff' } });
    expect(add.status).toBe(201);
    expect(add.body.temporaryPassword).toBeTruthy();
    const login = await api('POST', '/auth/login', { body: { email: add.body.member.email, password: add.body.temporaryPassword } });
    const t = login.body.accessToken;
    expect((await api('GET', `/merchants/${m.merchantId}/orders`, { token: t })).status).toBe(200);
    expect((await api('POST', `/merchants/${m.merchantId}/categories`, { token: t, body: { nameEn: 'X', nameAr: 'س' } })).status).toBe(403);
    expect((await api('POST', `/merchants/${m.merchantId}/staff`, { token: t, body: { email: 'x@qabnah.test', fullName: 'X Y', role: 'merchant_staff' } })).status).toBe(403);
  });

  it('only staff:manage can create staff, and nobody can remove their own super admin role', async () => {
    const ops = await staff('ops_manager');
    const sa = await staff('super_admin');
    expect((await api('POST', '/admin/staff', { token: ops.token, body: { email: 'new@qabnah.test', fullName: 'New Person', roleKeys: ['dispatcher'] } })).status).toBe(403);
    const created = await api('POST', '/admin/staff', { token: sa.token, body: { email: `new.${Date.now()}@qabnah.test`, fullName: 'New Person', roleKeys: ['dispatcher'] } });
    expect(created.status).toBe(201);
    expect((await api('PUT', `/admin/staff/${sa.userId}/roles`, { token: sa.token, body: { roleKeys: ['analyst'] } })).status).toBe(403);
  });

  it('unauthenticated access to protected routes is 401', async () => {
    expect((await api('GET', '/me')).status).toBe(401);
    expect((await api('GET', '/admin/orders')).status).toBe(401);
  });

  it('records admin mutations in the audit log', async () => {
    const sa = await staff('super_admin');
    await api('PUT', '/admin/settings', { token: sa.token, body: { serviceFeeBaisa: 150 } });
    const logs = await api('GET', '/admin/audit-logs?entityType=platform_settings', { token: sa.token });
    expect(logs.body.items[0]).toMatchObject({ action: 'settings.update', actorUserId: sa.userId });
    await api('PUT', '/admin/settings', { token: sa.token, body: { serviceFeeBaisa: 100 } });
  });
});
