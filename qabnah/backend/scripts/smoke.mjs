#!/usr/bin/env node
/**
 * End-to-end smoke test against a running, seeded Qabnah API (e.g. the docker compose stack).
 * Requires OTP_DEV_ECHO=true and PAYMENT_PROVIDER=mock (development defaults).
 *
 *   node scripts/smoke.mjs [baseUrl]      default http://localhost:4000/v1
 *
 * Journey: consumer signs in by OTP → browses a store → orders with variants (COD) → merchant accepts →
 * captain comes online → worker dispatches → captain accepts, picks up, delivers with PIN → ledger checked.
 * Then a C2C shipment paid online through the mock gateway.
 */
const BASE = process.argv[2] ?? 'http://localhost:4000/v1';
const PASSWORD = 'Qabnah-Dev-2026!';
let step = 0;
const log = (m) => console.log(`${String(++step).padStart(2, '0')}. ${m}`);

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return json;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function otp(phone) {
  const r = await call('POST', '/auth/otp/request', { body: { phone } }).catch(async (e) => {
    if (String(e.message).includes('429')) { await sleep(31_000); return call('POST', '/auth/otp/request', { body: { phone } }); }
    throw e;
  });
  if (!r.devCode) throw new Error('OTP_DEV_ECHO must be enabled for the smoke test');
  return (await call('POST', '/auth/otp/verify', { body: { phone, code: r.devCode } })).accessToken;
}
const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: PASSWORD } })).accessToken;
const assert = (cond, msg) => { if (!cond) throw new Error(`Assertion failed: ${msg}`); };

const t0 = Date.now();
log(`health: ${JSON.stringify(await call('GET', '/health/ready'))}`);

const consumer = await otp('+96890000002');
const me = await call('GET', '/me', { token: consumer });
log(`consumer signed in: ${me.user.fullName}`);
const addresses = (await call('GET', '/me/addresses', { token: consumer })).items;
assert(addresses.length > 0, 'seeded address');

const store = await call('GET', '/stores/qahwa-house');
log(`storefront ${store.merchant.nameEn} (${store.merchant.nameAr}) open=${store.merchant.isOpen}, ${store.categories.length} categories`);
const product = store.categories.flatMap((c) => c.products).find((p) => p.optionGroups.some((g) => g.kind === 'variant'));
const optionIds = product.optionGroups.filter((g) => g.minSelect > 0).map((g) => g.options[g.options.length - 1].id);
const cart = { merchantId: store.merchant.id, items: [{ productId: product.id, quantity: 2, optionIds }], addressId: addresses[0].id, paymentMethod: 'cod' };
const quote = await call('POST', '/orders/quote', { token: consumer, body: cart });
log(`quote: subtotal ${quote.subtotalBaisa} + delivery ${quote.deliveryFeeBaisa} + service ${quote.serviceFeeBaisa} = ${quote.totalBaisa} baisa (VAT incl. ${quote.vatBaisa})`);
const order = await call('POST', '/orders', { token: consumer, body: cart, headers: { 'idempotency-key': `smoke-${Date.now()}` } });
log(`order ${order.number} placed (${order.status}), delivery PIN ${order.delivery.deliveryPin}`);

const owner = await login('owner@qahwa-house.qabnah.test');
const accepted = await call('POST', `/merchants/${store.merchant.id}/orders/${order.id}/accept`, { token: owner, body: { prepTimeMinutes: 10 } });
log(`merchant accepted → ${accepted.status}`);

const captain = await otp('+96890001002');
await call('POST', '/captain/status', { token: captain, body: { online: true, location: { lat: 23.6120, lng: 58.4800 } } });
log('captain Ahmed online near Qurum; waiting for the worker to dispatch…');
let offer;
for (let i = 0; i < 30 && !offer; i++) {
  offer = (await call('GET', '/captain/offers', { token: captain })).items.find((o) => o.deliveryId === order.delivery.id);
  if (!offer) await sleep(1000);
}
assert(offer, 'captain received an offer (is the worker running?)');
log(`offer received: earning ${offer.earningBaisa} baisa, ${offer.distanceToPickupM} m to pickup`);
const job = await call('POST', `/captain/offers/${offer.id}/accept`, { token: captain });
log(`captain accepted → ${job.status}, next: ${job.nextActions.join(', ')}`);
await call('POST', `/merchants/${store.merchant.id}/orders/${order.id}/ready`, { token: owner, body: {} });
await call('POST', `/captain/deliveries/${job.id}/status`, { token: captain, body: { action: 'arrive_pickup' } });
await call('POST', `/captain/deliveries/${job.id}/status`, { token: captain, body: { action: 'pickup' } });
await call('POST', '/captain/location', { token: captain, body: { lat: 23.600, lng: 58.460, heading: 270 } });
const tracking = await call('GET', `/orders/${order.id}/tracking`, { token: consumer });
log(`tracking: ${tracking.deliveryStatus}, captain ${tracking.captain.firstName} (${tracking.captain.vehiclePlate}), ETA ${tracking.etaDropoffAt}`);
const done = await call('POST', `/captain/deliveries/${job.id}/complete`, { token: captain, body: { pin: order.delivery.deliveryPin, recipientName: 'Khalid' } });
log(`delivered → ${done.status}`);
const final = await call('GET', `/orders/${order.id}`, { token: consumer });
assert(final.status === 'delivered' && final.paymentStatus === 'paid', 'order delivered and COD marked paid');
const earnings = await call('GET', '/captain/earnings', { token: captain });
log(`captain today: ${earnings.deliveriesCount} deliveries, earned ${earnings.earningsBaisa}, cash held ${earnings.codCollectedBaisa}, balance ${earnings.balanceBaisa}`);
await call('POST', `/orders/${order.id}/rating`, { token: consumer, body: { captain: { score: 5 }, merchant: { score: 5 } } });
await call('POST', '/captain/status', { token: captain, body: { online: false } });

// C2C, paid online via the mock gateway
const ship = await call('POST', '/shipments', {
  token: consumer,
  body: { pickup: { addressId: addresses[0].id }, dropoff: { location: { lat: 23.6105, lng: 58.4802 }, contactName: 'Maryam', contactPhone: '90000001' }, package: { size: 'small', description: 'Smoke test envelope' }, paymentMethod: 'online' },
});
const checkout = await call('POST', `/orders/${ship.id}/checkout`, { token: consumer, body: {} });
log(`C2C ${ship.number}: fee ${ship.deliveryFeeBaisa} baisa, checkout ${checkout.checkoutUrl}`);
await call('POST', `/mock-pay/${checkout.paymentId}/complete`, { body: { outcome: 'paid' } });
const paid = await call('GET', `/orders/${ship.id}`, { token: consumer });
assert(paid.paymentStatus === 'paid' && paid.status === 'ready_for_pickup', 'shipment paid and dispatching');
log(`C2C paid → ${paid.status}, delivery ${paid.delivery.status}`);
await call('POST', `/orders/${ship.id}/cancel`, { token: consumer, body: { reason: 'smoke test cleanup' } });
const refunded = await call('GET', `/orders/${ship.id}`, { token: consumer });
log(`C2C cancelled before pickup → payment ${refunded.paymentStatus}`);

const admin = await login('admin@qabnah.test');
const live = await call('GET', '/admin/operations/live', { token: admin });
log(`admin live ops: ${JSON.stringify(live.kpis)}`);
console.log(`\nSMOKE PASSED in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
