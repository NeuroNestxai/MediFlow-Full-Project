import { beforeAll, describe, expect, it } from 'vitest';
import { getApp, api, KHUWAIR, merchant, MSQ, one, phoneLogin, pool, product, q, resetDb, staff } from '../helpers/ctx.js';

beforeAll(resetDb);

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2b1f1c90000000049454e44ae426082', 'hex');

async function upload(token: string, purpose: string, data = PNG, mime = 'image/png') {
  const app = await getApp();
  const boundary = '----qabnahtest';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="doc.png"\r\nContent-Type: ${mime}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await app.inject({ method: 'POST', url: '/v1/files', headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
  return { status: r.statusCode, body: r.json() };
}

describe('files', () => {
  it('uploads images, rejects spoofed content, and protects private files', async () => {
    const u = await phoneLogin();
    const up = await upload(u.token, 'captain_document');
    expect(up.status).toBe(201);
    expect(up.body.url).toContain('sig=');
    const spoof = await upload(u.token, 'captain_document', Buffer.from('not really a png'), 'image/png');
    expect(spoof.status).toBe(400);
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: `/v1/files/${up.body.id}` })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: up.body.url.replace(/^https?:\/\/[^/]+/, '') })).statusCode).toBe(200);
    const other = await phoneLogin();
    expect((await app.inject({ method: 'GET', url: `/v1/files/${up.body.id}`, headers: { authorization: `Bearer ${other.token}` } })).statusCode).toBe(403);
  });
});

describe('captain onboarding & review', () => {
  it('registers, uploads required documents, moves to review, gets approved, goes online', async () => {
    const u = await phoneLogin(undefined, 'Salim Al Harthy');
    const reg = await api('POST', '/captain/register', { token: u.token, body: { vehicleType: 'car', vehiclePlate: '12345 A', nationality: 'Omani', iban: 'OM810180000000000000000' } });
    expect(reg.status).toBe(201);
    expect(reg.body.status).toBe('pending_documents');
    expect(reg.body.missingDocuments).toEqual(expect.arrayContaining(['national_id', 'driving_license', 'vehicle_registration', 'profile_photo', 'vehicle_insurance']));
    expect((await api('POST', '/captain/register', { token: u.token, body: { vehicleType: 'car' } })).status).toBe(409);
    // cannot go online before approval
    expect((await api('POST', '/captain/status', { token: u.token, body: { online: true, location: KHUWAIR } })).status).toBe(403);
    // expired documents are refused
    const f0 = await upload(u.token, 'captain_document');
    expect((await api('POST', '/captain/documents', { token: u.token, body: { docType: 'driving_license', fileId: f0.body.id, expiresAt: '2020-01-01' } })).status).toBe(400);

    for (const docType of reg.body.missingDocuments) {
      const f = await upload(u.token, 'captain_document');
      const d = await api('POST', '/captain/documents', { token: u.token, body: { docType, fileId: f.body.id, number: 'X1', expiresAt: '2030-01-01' } });
      expect(d.status).toBe(201);
    }
    let p = (await api('GET', '/captain/profile', { token: u.token })).body;
    expect(p.status).toBe('pending_review');
    expect(p.missingDocuments).toEqual([]);

    const zones = (await api('GET', '/zones')).body.items;
    expect(zones.length).toBe(11);
    const z = await api('PUT', '/captain/zones', { token: u.token, body: { zoneIds: zones.slice(0, 3).map((x: any) => x.id) } });
    expect(z.body.zoneIds).toHaveLength(3);
    const av = await api('PUT', '/captain/availability', { token: u.token, body: { slots: [{ weekday: 0, start: '08:00', end: '14:00' }, { weekday: 5, start: '16:00', end: '23:00' }] } });
    expect(av.body.availability).toEqual([{ weekday: 0, start: '08:00', end: '14:00' }, { weekday: 5, start: '16:00', end: '23:00' }]);
    expect((await api('PUT', '/captain/availability', { token: u.token, body: { slots: [{ weekday: 0, start: '14:00', end: '08:00' }] } })).status).toBe(400);

    const reviewer = await staff('onboarding_reviewer');
    const detail = await api('GET', `/admin/captains/${p.id}`, { token: reviewer.token });
    expect(detail.body.documents.length).toBe(5);
    // approve blocked until documents approved
    expect((await api('POST', `/admin/captains/${p.id}/approve`, { token: reviewer.token, body: {} })).body.error.code).toBe('documents_incomplete');
    // reject one document → captain goes back to pending_documents and is notified
    const [first, ...rest] = detail.body.documents;
    expect((await api('POST', `/admin/captain-documents/${first.id}/review`, { token: reviewer.token, body: { status: 'rejected' } })).status).toBe(400); // reason needed
    await api('POST', `/admin/captain-documents/${first.id}/review`, { token: reviewer.token, body: { status: 'rejected', reason: 'Blurry photo' } });
    p = (await api('GET', '/captain/profile', { token: u.token })).body;
    expect(p.status).toBe('pending_documents');
    expect(p.documents.find((d: any) => d.id === first.id).rejectionReason).toBe('Blurry photo');
    const notes = (await api('GET', '/me/notifications', { token: u.token })).body;
    expect(notes.items[0].type).toBe('captain.document_rejected');
    // re-upload and approve all
    const f = await upload(u.token, 'captain_document');
    const again = await api('POST', '/captain/documents', { token: u.token, body: { docType: first.docType, fileId: f.body.id, expiresAt: '2030-01-01' } });
    for (const d of [...rest, again.body]) await api('POST', `/admin/captain-documents/${d.id}/review`, { token: reviewer.token, body: { status: 'approved' } });
    const ok = await api('POST', `/admin/captains/${p.id}/approve`, { token: reviewer.token, body: {} });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('active');
    const on = await api('POST', '/captain/status', { token: u.token, body: { online: true, location: KHUWAIR } });
    expect(on.status).toBe(200);
    expect(on.body.isOnline).toBe(true);
  });

  it('requires a fleet partner for non-Omani captains (configurable)', async () => {
    const u = await phoneLogin();
    const reg = (await api('POST', '/captain/register', { token: u.token, body: { vehicleType: 'bike', nationality: 'Pakistani' } })).body;
    await q(pool, `UPDATE captains SET status = 'pending_review' WHERE id = $1`, [reg.id]);
    for (const docType of reg.missingDocuments) {
      const f = await upload(u.token, 'captain_document');
      const d = await api('POST', '/captain/documents', { token: u.token, body: { docType, fileId: f.body.id } });
      await q(pool, `UPDATE captain_documents SET status = 'approved' WHERE id = $1`, [d.body.id]);
    }
    const reviewer = await staff('onboarding_reviewer');
    const r1 = await api('POST', `/admin/captains/${reg.id}/approve`, { token: reviewer.token, body: {} });
    expect(r1.body.error.code).toBe('fleet_required');
    const ops = await staff('ops_manager');
    expect((await api('POST', '/admin/fleet-partners', { token: reviewer.token, body: { name: 'Fleet Co' } })).status).toBe(403);
    const fp = await api('POST', '/admin/fleet-partners', { token: ops.token, body: { name: 'Sample Fleet LLC', licenceNumber: 'L-1' } });
    expect(fp.status).toBe(201);
    const r2 = await api('POST', `/admin/captains/${reg.id}/approve`, { token: reviewer.token, body: { employmentModel: 'fleet', fleetPartnerId: fp.body.id } });
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ status: 'active', employmentModel: 'fleet', fleetPartner: { name: 'Sample Fleet LLC' } });
  });

  it('expired documents block going online', async () => {
    const u = await phoneLogin();
    const reg = (await api('POST', '/captain/register', { token: u.token, body: { vehicleType: 'car', nationality: 'Omani' } })).body;
    const f = await upload(u.token, 'captain_document');
    const d = await api('POST', '/captain/documents', { token: u.token, body: { docType: 'driving_license', fileId: f.body.id, expiresAt: '2030-01-01' } });
    await q(pool, `UPDATE captain_documents SET status = 'approved', expires_at = '2021-01-01' WHERE id = $1`, [d.body.id]);
    await q(pool, `UPDATE captains SET status = 'active' WHERE id = $1`, [reg.id]);
    await q(pool, `INSERT INTO captain_zones (captain_id, zone_id) SELECT $1, id FROM zones LIMIT 1`, [reg.id]);
    const { invalidateAuthCache } = await import('../../src/lib/auth.js');
    invalidateAuthCache(u.userId);
    const r = await api('POST', '/captain/status', { token: u.token, body: { online: true, location: KHUWAIR } });
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/driving license has expired/);
  });
});

describe('merchant onboarding, catalog and storefront', () => {
  it('self-registers, is reviewed, then appears in the public storefront', async () => {
    const reg = await api('POST', '/merchants/register', {
      body: { email: 'owner@ward-test.qabnah.test', password: 'Strong-Pass-123', fullName: 'Owner', merchant: { nameEn: 'Ward Test', nameAr: 'ورد', slug: 'ward-test', category: 'flowers', location: MSQ } },
    });
    expect(reg.status).toBe(201);
    expect((await api('GET', '/merchants/slug-availability?slug=ward-test')).body).toEqual({ slug: 'ward-test', valid: true, available: false }); // pending stores count
    expect((await api('GET', '/merchants/slug-availability?slug=brand-new-shop')).body.available).toBe(true);
    expect((await api('GET', '/merchants/slug-availability?slug=Bad Slug')).body.valid).toBe(false);
    const dup = await api('POST', '/merchants/register', { body: { email: 'x@qabnah.test', password: 'Strong-Pass-123', fullName: 'Xy Z', merchant: { nameEn: 'Xy', nameAr: 'س س', slug: 'ward-test', category: 'flowers', location: MSQ } } });
    expect(dup.body.error.code).toBe('slug_taken');
    const t = reg.body.accessToken;
    const mid = reg.body.merchantId;
    const me = (await api('GET', '/me', { token: t })).body;
    expect(me.merchants[0]).toMatchObject({ id: mid, status: 'pending_review', roles: ['merchant_owner'] });
    expect(me.merchants[0].permissions).toContain('merchant.staff:manage');
    expect((await api('GET', '/stores/ward-test')).status).toBe(404);
    // pending stores cannot create payment links or deliveries
    expect((await api('POST', `/merchants/${mid}/payment-links`, { token: t, body: { title: 'Deposit', amountBaisa: 1000 } })).status).toBe(409);

    const doc = await upload(t, 'merchant_document');
    expect((await api('POST', `/merchants/${mid}/documents`, { token: t, body: { docType: 'commercial_registration', fileId: doc.body.id, number: 'CR-1' } })).status).toBe(201);

    const rv = await staff('onboarding_reviewer');
    const list = await api('GET', '/admin/merchants?status=pending_review', { token: rv.token });
    expect(list.body.items.map((m: any) => m.slug)).toContain('ward-test');
    const detail = await api('GET', `/admin/merchants/${mid}`, { token: rv.token });
    expect(detail.body.documents[0]).toMatchObject({ docType: 'commercial_registration', status: 'pending' });
    expect((await api('POST', `/admin/merchant-documents/${detail.body.documents[0].id}/review`, { token: rv.token, body: { status: 'approved' } })).status).toBe(200);
    expect((await api('POST', `/admin/merchants/${mid}/suspend`, { token: rv.token, body: { reason: 'x' } })).status).toBe(403); // needs merchants:manage
    const ap = await api('POST', `/admin/merchants/${mid}/approve`, { token: rv.token, body: {} });
    expect(ap.body.status).toBe('active');

    // branding, banner, catalog
    const up = await api('PATCH', `/merchants/${mid}`, { token: t, body: { brandColor: '#BE185D', taglineEn: 'Bouquets', openingHours: [], isOpen: true, whatsappEnabled: true, whatsappPhone: '91234567' } });
    expect(up.body).toMatchObject({ brandColor: '#BE185D', whatsappPhone: '+96891234567', storefrontUrl: expect.stringContaining('/s/ward-test') });
    expect((await api('PATCH', `/merchants/${mid}`, { token: t, body: { brandColor: 'pink' } })).status).toBe(400);
    expect((await api('PATCH', `/merchants/${mid}`, { token: t, body: { logoUrl: 'https://example.com/logo.png' } })).body.logoUrl).toBe('https://example.com/logo.png');
    expect((await api('PATCH', `/merchants/${mid}`, { token: t, body: { logoUrl: '' } })).body.logoUrl).toBeNull();
    expect((await api('GET', `/merchants/${mid}/documents`, { token: t })).body.items[0].fileUrl).toContain('sig=');
    expect((await api('POST', `/merchants/${mid}/banners`, { token: t, body: { imageUrl: 'https://example.com/b.jpg', titleEn: 'Valentine' } })).status).toBe(201);
    const cat = (await api('POST', `/merchants/${mid}/categories`, { token: t, body: { nameEn: 'Bouquets', nameAr: 'باقات' } })).body;
    const m = { token: t, merchantId: mid };
    const p = await product(m, { categoryId: cat.id, nameEn: 'Red Roses', nameAr: 'ورد أحمر', basePriceBaisa: 12000 });
    expect(p.optionGroups[0]).toMatchObject({ kind: 'variant', minSelect: 1, maxSelect: 1 });
    expect(p.optionGroups[1]).toMatchObject({ kind: 'addon', minSelect: 0, maxSelect: 2 });
    await product(m, { nameEn: 'Hidden', nameAr: 'مخفي', basePriceBaisa: 100, optionGroups: [] });
    const hidden = (await api('GET', `/merchants/${mid}/products?q=Hidden`, { token: t })).body.items[0];
    await api('PATCH', `/merchants/${mid}/products/${hidden.id}`, { token: t, body: { isAvailable: false } });
    // invalid option group is rejected
    expect((await api('POST', `/merchants/${mid}/products`, { token: t, body: { nameEn: 'X', nameAr: 'س', basePriceBaisa: 1, optionGroups: [{ kind: 'addon', nameEn: 'A', nameAr: 'أ', minSelect: 3, maxSelect: 1, options: [{ nameEn: 'o', nameAr: 'و' }] }] } })).status).toBe(400);
    // a category from another store cannot be used
    const other = await merchant();
    const otherCat = (await api('POST', `/merchants/${other.merchantId}/categories`, { token: other.token, body: { nameEn: 'O', nameAr: 'و' } })).body;
    expect((await api('POST', `/merchants/${mid}/products`, { token: t, body: { categoryId: otherCat.id, nameEn: 'X', nameAr: 'س', basePriceBaisa: 1 } })).status).toBe(400);

    const sf = await api('GET', '/stores/ward-test');
    expect(sf.status).toBe(200);
    expect(sf.body.merchant).toMatchObject({ slug: 'ward-test', brandColor: '#BE185D', isOpen: true });
    expect(sf.body.banners).toHaveLength(1);
    expect(sf.body.categories[0].products[0].nameEn).toBe('Red Roses');
    const list2 = await api('GET', `/stores?lat=${MSQ.lat}&lng=${MSQ.lng}&category=flowers`);
    expect(list2.body.items[0]).toMatchObject({ slug: 'ward-test' });
    expect(list2.body.items[0].distanceM).toBeLessThan(50);

    // PUT replaces option groups
    const put = await api('PUT', `/merchants/${mid}/products/${p.id}`, { token: t, body: { nameEn: 'Red Roses', nameAr: 'ورد أحمر', basePriceBaisa: 13000, categoryId: cat.id, optionGroups: [] } });
    expect(put.body).toMatchObject({ basePriceBaisa: 13000, optionGroups: [] });
  });
});

describe('admin configuration', () => {
  it('manages zones, pricing rules, dispatch rules, settings and plans', async () => {
    const sa = await staff('super_admin');
    const zone = await api('POST', '/admin/zones', { token: sa.token, body: { code: 'MCT-TEST', nameEn: 'Test', nameAr: 'تجربة', boundary: { type: 'Polygon', coordinates: [[[58.0, 23.0], [58.1, 23.0], [58.1, 23.1], [58.0, 23.1], [58.0, 23.0]]] } } });
    expect(zone.status).toBe(201);
    expect(zone.body.boundary.type).toBe('Polygon');
    const pr = await api('POST', '/admin/pricing-rules', { token: sa.token, body: { name: 'Test zone c2c', zoneId: zone.body.id, deliveryType: 'c2c', baseFeeBaisa: 2000, perKmBaisa: 0, minFeeBaisa: 2000 } });
    expect(pr.status).toBe(201);
    const q1 = await api('POST', '/quotes/delivery', { body: { type: 'c2c', pickup: { lat: 23.05, lng: 58.05 }, dropoff: { lat: 23.06, lng: 58.06 } } });
    expect(q1.body).toMatchObject({ feeBaisa: 2000, zoneId: zone.body.id });
    await api('PATCH', `/admin/pricing-rules/${pr.body.id}`, { token: sa.token, body: { surgeMultiplier: 1.5 } });
    expect((await api('POST', '/quotes/delivery', { body: { type: 'c2c', pickup: { lat: 23.05, lng: 58.05 }, dropoff: { lat: 23.06, lng: 58.06 } } })).body.feeBaisa).toBe(3000);
    const dr = await api('PUT', '/admin/dispatch-rules', { token: sa.token, body: {
      zoneId: zone.body.id, strategy: 'broadcast', autoDispatch: true, dispatchOnAccept: false, searchRadiusKm: 2, radiusStepKm: 1, maxRadiusKm: 6, maxRounds: 4, broadcastSize: 2,
      offerTimeoutS: 20, locationMaxAgeS: 60, respectSchedule: true, bikeBlackout: [], weightDistance: 0.5, weightRating: 0.25, weightAcceptance: 0.25 } });
    expect(dr.body).toMatchObject({ zoneId: zone.body.id, strategy: 'broadcast' });
    expect((await api('GET', '/admin/dispatch-rules', { token: sa.token })).body.items).toHaveLength(2);
    const s = await api('PUT', '/admin/settings', { token: sa.token, body: { codMaxBaisa: 40000 } });
    expect(s.body.codMaxBaisa).toBe(40000);
    expect((await api('PUT', '/admin/settings', { token: sa.token, body: { unknownKey: 1 } })).status).toBe(400);
    const plan = await api('POST', '/admin/plans', { token: sa.token, body: { code: 'pro', nameEn: 'Pro', nameAr: 'برو', monthlyFeeBaisa: 30000, commissionBps: 600 } });
    expect(plan.status).toBe(201);
    const m = await merchant();
    const upd = await api('PATCH', `/admin/merchants/${m.merchantId}`, { token: sa.token, body: { planId: plan.body.id, commissionBpsOverride: null } });
    expect(upd.body).toMatchObject({ commissionBps: 600, plan: { code: 'pro' } });
  });
});

describe('notifications & devices', () => {
  it('registers push devices and marks notifications read', async () => {
    const u = await phoneLogin();
    expect((await api('POST', '/me/devices', { token: u.token, body: { platform: 'ios', app: 'consumer', token: 'apns-token-1234567890' } })).status).toBe(204);
    await q(pool, `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'x','t','b')`, [u.userId]);
    const n = (await api('GET', '/me/notifications', { token: u.token })).body;
    expect(n.unread).toBe(1);
    await api('POST', `/me/notifications/${n.items[0].id}/read`, { token: u.token });
    expect((await api('GET', '/me/notifications', { token: u.token })).body.unread).toBe(0);
    const pat = await api('PATCH', '/me', { token: u.token, body: { locale: 'en', fullName: 'New Name' } });
    expect(pat.body.user).toMatchObject({ locale: 'en', fullName: 'New Name' });
    expect(await one(pool, `SELECT count(*)::int AS n FROM device_tokens WHERE user_id = $1`, [u.userId])).toEqual({ n: 1 });
  });
});
