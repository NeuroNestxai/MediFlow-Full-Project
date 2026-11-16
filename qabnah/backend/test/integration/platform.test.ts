import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import YAML from 'yaml';
import { hmacHex } from '../../src/lib/crypto.js';
import { startListener, stopListener } from '../../src/realtime/hub.js';
import { runOrderTimeouts } from '../../src/worker.js';
import { api, captain, consumerWithAddress, getApp, KHUWAIR, merchant, one, pendingOffers, phoneLogin, pool, product, q, QURUM, resetDb, staff } from '../helpers/ctx.js';

beforeAll(resetDb);

async function deliveredOrder() {
  await q(pool, `UPDATE captains SET is_online = false`); // isolate from captains created by earlier tests
  const m = await merchant({ location: KHUWAIR, commissionBps: 1000 });
  const p = await product(m, { optionGroups: [], basePriceBaisa: 5000 });
  const cap = await captain({ location: KHUWAIR });
  const c = await consumerWithAddress(QURUM);
  const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 1 }], addressId: c.addressId, paymentMethod: 'cod' } })).body;
  await api('POST', `/merchants/${m.merchantId}/orders/${o.id}/accept`, { token: m.token, body: {} });
  const [offer] = await pendingOffers(cap.token);
  await api('POST', `/captain/offers/${offer.id}/accept`, { token: cap.token });
  await api('POST', `/captain/deliveries/${o.delivery.id}/status`, { token: cap.token, body: { action: 'pickup' } });
  await api('POST', `/captain/deliveries/${o.delivery.id}/complete`, { token: cap.token, body: { pin: o.delivery.deliveryPin } });
  return { m, cap, c, o };
}

describe('finance: settlements and cash remittance', () => {
  it('generates settlements, enforces four-eyes approval, records payouts', async () => {
    const { m, cap, o } = await deliveredOrder();
    const fin = await staff('finance');
    const fm = await staff('finance_manager');
    const today = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
    const bal = await api('GET', '/admin/finance/balances', { token: fin.token });
    expect(bal.body.accounts.find((a: any) => a.accountId === m.merchantId).balanceBaisa).toBe(4500);
    expect(bal.body.accounts.find((a: any) => a.accountId === cap.captainId).cashHeldBaisa).toBe(o.totalBaisa);

    const gen = await api('POST', '/admin/settlements/generate', { token: fin.token, body: { accountType: 'merchant', periodStart: '2026-01-01', periodEnd: today } });
    expect(gen.status).toBe(201);
    const s = gen.body.items.find((x: any) => x.accountId === m.merchantId);
    expect(s).toMatchObject({ status: 'draft', creditsBaisa: 5000, debitsBaisa: 500, netBaisa: 4500, entryCount: 2 });
    // the finance officer who generated it cannot approve (also lacks the permission); a finance manager can
    expect((await api('POST', `/admin/settlements/${s.id}/approve`, { token: fin.token })).status).toBe(403);
    expect((await api('POST', `/admin/settlements/${s.id}/mark-paid`, { token: fin.token, body: { payoutReference: 'TRX-1' } })).status).toBe(409);
    expect((await api('POST', `/admin/settlements/${s.id}/approve`, { token: fm.token })).body.status).toBe('approved');
    expect((await api('POST', `/admin/settlements/${s.id}/mark-paid`, { token: fin.token, body: {} })).status).toBe(400);
    expect((await api('POST', `/admin/settlements/${s.id}/mark-paid`, { token: fin.token, body: { payoutReference: 'BM-TRX-0001' } })).body.status).toBe('paid');
    expect((await api('GET', `/merchants/${m.merchantId}/finance`, { token: m.token })).body.balanceBaisa).toBe(0);
    // already-settled entries are not settled twice
    const gen2 = await api('POST', '/admin/settlements/generate', { token: fin.token, body: { accountType: 'merchant', periodStart: '2026-01-01', periodEnd: today } });
    expect(gen2.body.items.find((x: any) => x.accountId === m.merchantId)).toBeUndefined();

    // a super admin who generated a batch still cannot approve their own batch
    const sa = await staff('super_admin');
    const g3 = await api('POST', '/admin/settlements/generate', { token: sa.token, body: { accountType: 'captain', periodStart: '2026-01-01', periodEnd: today } });
    const capS = g3.body.items.find((x: any) => x.accountId === cap.captainId);
    expect(capS.netBaisa).toBeLessThan(0); // captain owes the cash collected minus earning
    const self = await api('POST', `/admin/settlements/${capS.id}/approve`, { token: sa.token });
    expect(self.status).toBe(403);
    expect((await api('POST', `/admin/settlements/${capS.id}/cancel`, { token: sa.token })).body.status).toBe('cancelled');

    // Cash remittance reduces the captain's debt
    const before = (await api('GET', '/captain/earnings', { token: cap.token })).body.balanceBaisa;
    const rem = await api('POST', `/admin/captains/${cap.captainId}/cod-remittance`, { token: fin.token, body: { amountBaisa: o.totalBaisa, note: 'Cash handed in at hub' } });
    expect(rem.body.balanceBaisa).toBe(before + o.totalBaisa);
  });

  it('refunds online payments partially and blocks over-refunds', async () => {
    const m = await merchant({ location: KHUWAIR });
    const p = await product(m, { optionGroups: [], basePriceBaisa: 5000 });
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 1 }], addressId: c.addressId, paymentMethod: 'online' } })).body;
    const co = await api('POST', `/orders/${o.id}/checkout`, { token: c.token, body: {} });
    await api('POST', `/mock-pay/${co.body.paymentId}/complete`, { body: { outcome: 'paid' } });
    const fin = await staff('finance');
    const r1 = await api('POST', `/admin/orders/${o.id}/refund`, { token: fin.token, body: { amountBaisa: 1000, reason: 'Missing item' } });
    expect(r1.status).toBe(200);
    expect(r1.body.order.paymentStatus).toBe('partially_refunded');
    const over = await api('POST', `/admin/orders/${o.id}/refund`, { token: fin.token, body: { amountBaisa: o.totalBaisa, reason: 'All' } });
    expect(over.body.error.code).toBe('refund_exceeds_payment');
    const disp = await staff('dispatcher');
    expect((await api('POST', `/admin/orders/${o.id}/refund`, { token: disp.token, body: { amountBaisa: 100, reason: 'x y z' } })).status).toBe(403);
  });
});

describe('worker timeouts', () => {
  it('cancels orders the store did not accept in time', async () => {
    const m = await merchant({ location: KHUWAIR });
    const p = await product(m, { optionGroups: [], basePriceBaisa: 1000 });
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 1 }], addressId: c.addressId, paymentMethod: 'cod' } })).body;
    await q(pool, `UPDATE orders SET placed_at = now() - interval '1 hour' WHERE id = $1`, [o.id]);
    expect(await runOrderTimeouts()).toBeGreaterThanOrEqual(1);
    const after = (await api('GET', `/orders/${o.id}`, { token: c.token })).body;
    expect(after).toMatchObject({ status: 'cancelled', cancelReason: 'Store did not accept the order in time' });
    expect(after.delivery.status).toBe('cancelled');
  });
});

describe('support tickets', () => {
  it('lets customers open tickets, staff reply with internal notes hidden from customers', async () => {
    const { c, o } = await deliveredOrder();
    const t = await api('POST', '/support/tickets', { token: c.token, body: { subject: 'Missing laban', category: 'order_issue', orderId: o.id, message: 'The laban was missing' } });
    expect(t.status).toBe(201);
    expect(t.body.number).toMatch(/^T\d+$/);
    const stranger = await phoneLogin();
    expect((await api('GET', `/support/tickets/${t.body.id}`, { token: stranger.token })).status).toBe(404);
    expect((await api('POST', '/support/tickets', { token: stranger.token, body: { subject: 'Not mine', category: 'order_issue', orderId: o.id, message: 'hello' } })).status).toBe(400);
    const agent = await staff('support_agent');
    const queue = await api('GET', '/admin/support/tickets?status=open', { token: agent.token });
    expect(queue.body.items.some((x: any) => x.id === t.body.id)).toBe(true);
    await api('POST', `/support/tickets/${t.body.id}/messages`, { token: agent.token, body: { body: 'Refund approved by finance', isInternal: true } });
    await api('POST', `/support/tickets/${t.body.id}/messages`, { token: agent.token, body: { body: 'Sorry! We are refunding the laban.' } });
    expect((await api('PATCH', `/admin/support/tickets/${t.body.id}`, { token: agent.token, body: { assignedTo: agent.userId, status: 'resolved' } })).body.status).toBe('resolved');
    const customerView = (await api('GET', `/support/tickets/${t.body.id}`, { token: c.token })).body;
    expect(customerView.messages.map((m: any) => m.body)).toEqual(['The laban was missing', 'Sorry! We are refunding the laban.']);
    const staffView = (await api('GET', `/support/tickets/${t.body.id}`, { token: agent.token })).body;
    expect(staffView.messages).toHaveLength(3);
    expect((await api('POST', `/support/tickets/${t.body.id}/messages`, { token: c.token, body: { body: 'secret', isInternal: true } })).status).toBe(403);
    const notes = (await api('GET', '/me/notifications', { token: c.token })).body.items.map((n: any) => n.type);
    expect(notes).toContain('support.reply');
  });
});

describe('analytics', () => {
  it('reports platform and merchant KPIs', async () => {
    const { m } = await deliveredOrder();
    const an = await staff('analyst');
    const r = await api('GET', '/admin/analytics/overview', { token: an.token });
    expect(r.status).toBe(200);
    expect(r.body.completedOrders).toBeGreaterThan(0);
    expect(r.body.gmvBaisa).toBeGreaterThan(0);
    expect(r.body.byDay.length).toBeGreaterThan(0);
    const mr = await api('GET', `/merchants/${m.merchantId}/analytics`, { token: m.token });
    expect(mr.body).toMatchObject({ orders: 1, completedOrders: 1, commissionBaisa: 500 });
    expect(mr.body.topProducts[0].quantity).toBe(1);
  });
});

describe('WhatsApp', () => {
  it('verifies the webhook challenge and signature, stores inbound messages and status updates', async () => {
    expect((await api('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status).toBe(403);
    const ok = await api('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=987');
    expect(ok.body).toBe(987);
    const m = await merchant();
    await api('PATCH', `/merchants/${m.merchantId}`, { token: m.token, body: { whatsappPhone: '91239999', whatsappEnabled: true } });
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { display_phone_number: '96891239999' }, messages: [{ id: 'wamid.1', from: '96890000001', type: 'text', text: { body: 'Is my order ready?' } }] } }] }] });
    const app = await getApp();
    const bad = await app.inject({ method: 'POST', url: '/v1/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' }, payload });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: 'POST', url: '/v1/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${hmacHex('test-app-secret', payload)}` }, payload });
    expect(good.statusCode).toBe(200);
    const log = await api('GET', `/merchants/${m.merchantId}/whatsapp/messages`, { token: m.token });
    expect(log.body.inbound[0]).toMatchObject({ from: '+96890000001', body: 'Is my order ready?' });
    const test = await api('POST', `/merchants/${m.merchantId}/whatsapp/test`, { token: m.token, body: { phone: '90000001' } });
    expect(test.body.status).toBe('sent'); // console provider in tests — nothing leaves the machine
  });
});

describe('realtime WebSocket', () => {
  let base = '';
  beforeAll(async () => {
    const app = await getApp();
    await startListener();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as any;
    base = `ws://127.0.0.1:${addr.port}/v1/realtime`;
  });
  afterAll(async () => { await stopListener(); });

  function connect(token: string) {
    const ws = new WebSocket(`${base}?token=${token}`);
    const messages: any[] = [];
    ws.on('message', (m) => messages.push(JSON.parse(String(m))));
    const waitFor = (pred: (m: any) => boolean, ms = 5000) =>
      new Promise<any>((resolve, reject) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          const hit = messages.find(pred);
          if (hit) { clearInterval(iv); resolve(hit); } else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error(`timeout; got ${JSON.stringify(messages)}`)); }
        }, 20);
      });
    return { ws, messages, waitFor, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  }

  it('authorizes channel subscriptions and pushes order, offer and location events', async () => {
    await q(pool, `UPDATE captains SET is_online = false`);
    const m = await merchant({ location: KHUWAIR });
    const p = await product(m, { optionGroups: [], basePriceBaisa: 1000 });
    const cap = await captain({ location: KHUWAIR });
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: m.merchantId, items: [{ productId: p.id, quantity: 1 }], addressId: c.addressId, paymentMethod: 'cod' } })).body;

    const customer = connect(c.token);
    await customer.waitFor((x) => x.type === 'ready');
    customer.send({ type: 'subscribe', channel: `order:${o.id}` });
    await customer.waitFor((x) => x.type === 'subscribed');

    const stranger = connect((await phoneLogin()).token);
    await stranger.waitFor((x) => x.type === 'ready');
    stranger.send({ type: 'subscribe', channel: `order:${o.id}` });
    expect((await stranger.waitFor((x) => x.type === 'error')).code).toBe('forbidden');
    stranger.send({ type: 'subscribe', channel: 'admin:ops' });
    await stranger.waitFor((x) => x.type === 'error' && x.channel === 'admin:ops');

    const capWs = connect(cap.token);
    await capWs.waitFor((x) => x.type === 'ready');
    capWs.send({ type: 'subscribe', channel: 'captain:me' });
    await capWs.waitFor((x) => x.type === 'subscribed');

    await api('POST', `/merchants/${m.merchantId}/orders/${o.id}/accept`, { token: m.token, body: {} });
    const ev = await customer.waitFor((x) => x.type === 'event' && x.event === 'order.status_changed');
    expect(ev.data).toMatchObject({ orderId: o.id, from: 'placed', to: 'accepted' });
    const offer = await capWs.waitFor((x) => x.type === 'event' && x.event === 'offer.created');
    expect(offer.channel).toBe('captain:me');
    expect(offer.data.deliveryId).toBe(o.delivery.id);

    await api('POST', `/captain/offers/${offer.data.id}/accept`, { token: cap.token });
    await customer.waitFor((x) => x.event === 'delivery.assigned');
    capWs.send({ type: 'location', lat: 23.595, lng: 58.45, heading: 90 });
    const loc = await customer.waitFor((x) => x.event === 'delivery.location');
    expect(loc.data).toMatchObject({ lat: 23.595, lng: 58.45 });
    expect(loc.data.etaPickupAt).toBeTruthy();
    for (const s of [customer, stranger, capWs]) s.ws.close();
  });

  it('rejects connections with an invalid token', async () => {
    const ws = new WebSocket(`${base}?token=nope`);
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4401);
  });
});

describe('API contract coverage', () => {
  it('every registered route is documented in API_CONTRACT.yaml', async () => {
    const app = await getApp();
    const spec = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../../API_CONTRACT.yaml'), 'utf8'));
    const documented = new Set<string>();
    for (const [p, ops] of Object.entries<any>(spec.paths)) for (const m of Object.keys(ops)) if (m !== 'parameters') documented.add(`${m.toUpperCase()} /v1${p.replace(/\{(\w+)\}/g, ':$1')}`);
    const norm = (s: string) => s.replace(/:\w+/g, ':p');
    const docNorm = new Set([...documented].map(norm));
    const routes: string[] = [];
    const all: { method: string; url: string }[] = (app as any)[Symbol.for('qabnah.routes')] ?? [];
    for (const r of all) routes.push(`${r.method} ${r.url}`);
    const undocumented = routes.map(norm).filter((r) => !r.startsWith('HEAD') && !r.startsWith('OPTIONS') && !docNorm.has(r) && !r.includes('/realtime'));
    expect(routes.length).toBeGreaterThan(80);
    expect(undocumented).toEqual([]);
  });
});
