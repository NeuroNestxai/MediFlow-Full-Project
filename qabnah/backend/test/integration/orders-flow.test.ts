import { beforeEach, describe, expect, it } from 'vitest';
import { runDispatchJob } from '../../src/worker.js';
import { api, captain, consumerWithAddress, KHUWAIR, merchant, MSQ, one, pendingOffers, pool, product, q, QURUM, resetDb, staff } from '../helpers/ctx.js';

beforeEach(resetDb);

async function setupStore() {
  const m = await merchant({ location: KHUWAIR, commissionBps: 1000 });
  const p = await product(m);
  const size = p.optionGroups.find((g: any) => g.kind === 'variant');
  const extras = p.optionGroups.find((g: any) => g.kind === 'addon');
  return { m, p, regular: size.options[0].id, large: size.options[1].id, cheese: extras.options[0].id, garlic: extras.options[1].id, fries: extras.options[2].id };
}

describe('marketplace order (B2C) — COD end to end', () => {
  it('prices, places, accepts, dispatches, delivers with PIN and posts the ledger', async () => {
    const s = await setupStore();
    const cap = await captain({ location: { lat: 23.5900, lng: 58.4400 } });
    const c = await consumerWithAddress(QURUM);
    const cart = { merchantId: s.m.merchantId, items: [{ productId: s.p.id, quantity: 2, optionIds: [s.large, s.cheese] }], addressId: c.addressId, paymentMethod: 'cod' };

    const quote = await api('POST', '/orders/quote', { token: c.token, body: cart });
    expect(quote.status).toBe(200);
    expect(quote.body.subtotalBaisa).toBe(2 * (900 + 400 + 200));
    expect(quote.body.totalBaisa).toBe(quote.body.subtotalBaisa + quote.body.deliveryFeeBaisa + quote.body.serviceFeeBaisa);
    expect(quote.body.vatIncluded).toBe(true);

    const placed = await api('POST', '/orders', { token: c.token, body: cart, headers: { 'idempotency-key': 'abc-1' } });
    expect(placed.status).toBe(201);
    const o = placed.body;
    expect(o).toMatchObject({ type: 'marketplace', status: 'placed', paymentMethod: 'cod', totalBaisa: quote.body.totalBaisa, codAmountBaisa: quote.body.totalBaisa });
    expect(o.items[0].options.map((x: any) => x.nameEn)).toEqual(['Large', 'Cheese']);
    expect(o.delivery.deliveryPin).toMatch(/^\d{4}$/);

    // Idempotent retry returns the same order
    const retry = await api('POST', '/orders', { token: c.token, body: cart, headers: { 'idempotency-key': 'abc-1' } });
    expect(retry.body.id).toBe(o.id);

    // Customer cannot jump the state machine; merchant accepts
    const accept = await api('POST', `/merchants/${s.m.merchantId}/orders/${o.id}/accept`, { token: s.m.token, body: { prepTimeMinutes: 15 } });
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('accepted');
    const invalid = await api('POST', `/merchants/${s.m.merchantId}/orders/${o.id}/accept`, { token: s.m.token, body: {} });
    expect(invalid.status).toBe(409);

    // dispatch_on_accept → offer to the nearby captain
    const offers = await pendingOffers(cap.token);
    expect(offers).toHaveLength(1);
    expect(offers[0].deliveryId).toBe(o.delivery.id);
    expect(offers[0].earningBaisa).toBeGreaterThan(0);
    const acc = await api('POST', `/captain/offers/${offers[0].id}/accept`, { token: cap.token });
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe('assigned');
    expect(acc.body.deliveryPin).toBeNull(); // captain never sees the PIN
    expect(acc.body.nextActions).toContain('arrive_pickup');

    // Consumer tracking shows the captain while active
    const tr = await api('GET', `/orders/${o.id}/tracking`, { token: c.token });
    expect(tr.body.captain.firstName).toBe('Captain');
    expect(tr.body.captain.location).toBeTruthy();

    // Captain cannot complete before pickup
    expect((await api('POST', `/captain/deliveries/${o.delivery.id}/complete`, { token: cap.token, body: { pin: o.delivery.deliveryPin } })).status).toBe(409);
    await api('POST', `/merchants/${s.m.merchantId}/orders/${o.id}/ready`, { token: s.m.token, body: {} });
    expect((await api('POST', `/captain/deliveries/${o.delivery.id}/status`, { token: cap.token, body: { action: 'arrive_pickup' } })).body.status).toBe('at_pickup');
    const picked = await api('POST', `/captain/deliveries/${o.delivery.id}/status`, { token: cap.token, body: { action: 'pickup', location: KHUWAIR } });
    expect(picked.body.status).toBe('picked_up');
    expect((await api('GET', `/orders/${o.id}`, { token: c.token })).body.status).toBe('out_for_delivery');

    // Location ping updates tracking breadcrumbs
    expect((await api('POST', '/captain/location', { token: cap.token, body: { lat: 23.600, lng: 58.460, heading: 80 } })).status).toBe(204);
    expect((await api('GET', `/orders/${o.id}/tracking`, { token: c.token })).body.path.length).toBeGreaterThan(0);

    // Wrong PIN, then correct PIN with COD collected
    const wrong = await api('POST', `/captain/deliveries/${o.delivery.id}/complete`, { token: cap.token, body: { pin: o.delivery.deliveryPin === '0000' ? '1111' : '0000' } });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('wrong_pin');
    const done = await api('POST', `/captain/deliveries/${o.delivery.id}/complete`, { token: cap.token, body: { pin: o.delivery.deliveryPin, recipientName: 'Maryam' } });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('delivered');

    const final = await api('GET', `/orders/${o.id}`, { token: c.token });
    expect(final.body).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(final.body.timeline.map((t: any) => t.status)).toEqual(['placed', 'accepted', 'ready_for_pickup', 'out_for_delivery', 'delivered']);

    // Ledger: merchant credited goods minus 10% commission; captain holds the cash
    const fin = await api('GET', `/merchants/${s.m.merchantId}/finance`, { token: s.m.token });
    expect(fin.body.balanceBaisa).toBe(3000 - 300);
    const earn = await api('GET', '/captain/earnings', { token: cap.token });
    expect(earn.body.deliveriesCount).toBe(1);
    expect(earn.body.codCollectedBaisa).toBe(o.totalBaisa);
    expect(earn.body.balanceBaisa).toBe(earn.body.earningsBaisa - o.totalBaisa);

    // Rating updates the captain's average
    expect((await api('POST', `/orders/${o.id}/rating`, { token: c.token, body: { captain: { score: 4 }, merchant: { score: 5, comment: 'Great' } } })).status).toBe(204);
    const capRow = await one(pool, `SELECT rating_avg, rating_count FROM captains WHERE id = $1`, [cap.captainId]);
    expect(Number(capRow.rating_avg)).toBe(4);
  });

  it('validates carts: missing variant, closed store, minimum order, stock', async () => {
    const s = await setupStore();
    const c = await consumerWithAddress(QURUM);
    const base = { merchantId: s.m.merchantId, addressId: c.addressId, paymentMethod: 'cod' };
    const noVariant = await api('POST', '/orders/quote', { token: c.token, body: { ...base, items: [{ productId: s.p.id, quantity: 1, optionIds: [] }] } });
    expect(noVariant.status).toBe(422);
    expect(noVariant.body.error.code).toBe('invalid_options');
    const tooMany = await api('POST', '/orders/quote', { token: c.token, body: { ...base, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular, s.cheese, s.garlic, s.fries] }] } });
    expect(tooMany.status).toBe(422);

    await api('PATCH', `/merchants/${s.m.merchantId}`, { token: s.m.token, body: { minOrderBaisa: 5000 } });
    const below = await api('POST', '/orders/quote', { token: c.token, body: { ...base, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular] }] } });
    expect(below.body.error.code).toBe('below_minimum');
    await api('PATCH', `/merchants/${s.m.merchantId}`, { token: s.m.token, body: { minOrderBaisa: 0, isOpen: false } });
    const closed = await api('POST', '/orders/quote', { token: c.token, body: { ...base, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular] }] } });
    expect(closed.body.error.code).toBe('merchant_closed');
    await api('PATCH', `/merchants/${s.m.merchantId}`, { token: s.m.token, body: { isOpen: true } });

    const stocked = await product(s.m, { nameEn: 'Rice 5kg', nameAr: 'أرز', basePriceBaisa: 3900, optionGroups: [], trackStock: true, stockQty: 1 });
    const out = await api('POST', '/orders', { token: c.token, body: { ...base, items: [{ productId: stocked.id, quantity: 2 }] } });
    expect(out.body.error.code).toBe('out_of_stock');
    const ok = await api('POST', '/orders', { token: c.token, body: { ...base, items: [{ productId: stocked.id, quantity: 1 }] } });
    expect(ok.status).toBe(201);
    expect((await one(pool, `SELECT stock_qty FROM products WHERE id = $1`, [stocked.id])).stock_qty).toBe(0);
    // Cancelling restocks
    expect((await api('POST', `/orders/${ok.body.id}/cancel`, { token: c.token, body: { reason: 'changed mind' } })).body.status).toBe('cancelled');
    expect((await one(pool, `SELECT stock_qty FROM products WHERE id = $1`, [stocked.id])).stock_qty).toBe(1);
  });

  it('rejects addresses outside the service area', async () => {
    const s = await setupStore();
    const c = await consumerWithAddress({ lat: 22.95, lng: 57.53 }); // Nizwa — no zone
    const r = await api('POST', '/orders/quote', { token: c.token, body: { merchantId: s.m.merchantId, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular] }], addressId: c.addressId, paymentMethod: 'cod' } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('out_of_service_area');
  });

  it('consumer can cancel only before the store accepts', async () => {
    const s = await setupStore();
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: s.m.merchantId, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular] }], addressId: c.addressId, paymentMethod: 'cod' } })).body;
    await api('POST', `/merchants/${s.m.merchantId}/orders/${o.id}/accept`, { token: s.m.token, body: {} });
    const r = await api('POST', `/orders/${o.id}/cancel`, { token: c.token, body: {} });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('not_cancellable');
    // other users cannot see the order
    const other = await consumerWithAddress();
    expect((await api('GET', `/orders/${o.id}`, { token: other.token })).status).toBe(404);
  });
});

describe('online payment (mock gateway)', () => {
  it('pending_payment → paid via mock gateway → placed; webhook replays are idempotent', async () => {
    const s = await setupStore();
    const c = await consumerWithAddress(QURUM);
    const o = (await api('POST', '/orders', { token: c.token, body: { merchantId: s.m.merchantId, items: [{ productId: s.p.id, quantity: 1, optionIds: [s.regular] }], addressId: c.addressId, paymentMethod: 'online' } })).body;
    expect(o).toMatchObject({ status: 'pending_payment', codAmountBaisa: 0 });
    // merchant does not see unpaid orders
    expect((await api('GET', `/merchants/${s.m.merchantId}/orders`, { token: s.m.token })).body.total).toBe(0);

    const co = await api('POST', `/orders/${o.id}/checkout`, { token: c.token, body: {} });
    expect(co.status).toBe(200);
    expect(co.body.checkoutUrl).toContain(`/v1/mock-pay/${co.body.paymentId}`);
    const page = await api('GET', `/mock-pay/${co.body.paymentId}`);
    expect(String(page.body)).toContain('TEST MODE');

    const fail = await api('POST', `/mock-pay/${co.body.paymentId}/complete`, { body: { outcome: 'failed' } });
    expect(fail.body.status).toBe('failed');
    expect((await api('GET', `/orders/${o.id}`, { token: c.token })).body).toMatchObject({ status: 'pending_payment', paymentStatus: 'failed' });

    const co2 = await api('POST', `/orders/${o.id}/checkout`, { token: c.token, body: {} });
    const paid = await api('POST', `/mock-pay/${co2.body.paymentId}/complete`, { body: { outcome: 'paid' } });
    expect(paid.body.status).toBe('paid');
    expect((await api('GET', `/orders/${o.id}`, { token: c.token })).body).toMatchObject({ status: 'placed', paymentStatus: 'paid' });

    const ref = (await one(pool, `SELECT provider_ref FROM payments WHERE id = $1`, [co2.body.paymentId])).provider_ref;
    const w1 = await api('POST', '/webhooks/payments/mock', { body: { providerRef: ref, status: 'paid' } });
    const w2 = await api('POST', '/webhooks/payments/mock', { body: { providerRef: ref, status: 'paid' } });
    expect(w1.body.received).toBe(true);
    expect(w2.body.duplicate).toBe(true);
    expect((await one(pool, `SELECT count(*)::int AS n FROM order_status_history WHERE order_id = $1 AND to_status = 'placed'`, [o.id])).n).toBe(1);

    // Store rejects → automatic full refund recorded
    await api('POST', `/merchants/${s.m.merchantId}/orders/${o.id}/reject`, { token: s.m.token, body: { reason: 'Closed early' } });
    const after = (await api('GET', `/orders/${o.id}`, { token: c.token })).body;
    expect(after).toMatchObject({ status: 'rejected', paymentStatus: 'refunded' });
    expect((await one(pool, `SELECT count(*)::int AS n, sum(amount_baisa)::int AS amt FROM refunds WHERE order_id = $1`, [o.id]))).toEqual({ n: 1, amt: o.totalBaisa });
  });
});

describe('C2C shipment', () => {
  it('quotes, dispatches immediately, and records cash collected for the fee', async () => {
    const cap = await captain({ location: MSQ });
    const sender = await consumerWithAddress(MSQ);
    const quote = await api('POST', '/quotes/delivery', { body: { type: 'c2c', pickup: MSQ, dropoff: QURUM } });
    expect(quote.status).toBe(200);
    expect(quote.body.captainEarningBaisa).toBeUndefined();
    const r = await api('POST', '/shipments', {
      token: sender.token,
      body: { pickup: { addressId: sender.addressId }, dropoff: { location: QURUM, contactName: 'Friend', contactPhone: '91112222' }, package: { size: 'small', description: 'Keys' }, paymentMethod: 'cod', codPayer: 'recipient' },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: 'c2c', status: 'ready_for_pickup', deliveryFeeBaisa: quote.body.feeBaisa, codAmountBaisa: quote.body.feeBaisa });
    expect(r.body.delivery.dropoff.contactPhone).toBe('+96891112222');
    const offers = await pendingOffers(cap.token);
    expect(offers).toHaveLength(1);
    expect(offers[0].orderType).toBe('c2c');
    // Offer hides exact dropoff (rounded ~500 m)
    expect(offers[0].dropoffLocation.lat * 200 % 1).toBeCloseTo(0);
    await api('POST', `/captain/offers/${offers[0].id}/accept`, { token: cap.token });
    const d = r.body.delivery.id;
    await api('POST', `/captain/deliveries/${d}/status`, { token: cap.token, body: { action: 'pickup' } });
    const done = await api('POST', `/captain/deliveries/${d}/complete`, { token: cap.token, body: { pin: r.body.delivery.deliveryPin } });
    expect(done.status).toBe(200);
    const earn = (await api('GET', '/captain/earnings', { token: cap.token })).body;
    expect(earn.codCollectedBaisa).toBe(quote.body.feeBaisa);
  });

  it('requires codPayer for cash shipments', async () => {
    const s = await consumerWithAddress(MSQ);
    const r = await api('POST', '/shipments', { token: s.token, body: { pickup: { addressId: s.addressId }, dropoff: { location: QURUM, contactPhone: '91112222' }, package: { size: 'small', description: 'Keys' }, paymentMethod: 'cod' } });
    expect(r.status).toBe(400);
  });
});

describe('merchant-initiated delivery & payment links', () => {
  it('books a courier for an Instagram sale with cash collection', async () => {
    const m = await merchant({ location: KHUWAIR });
    const cap = await captain({ location: KHUWAIR });
    const r = await api('POST', `/merchants/${m.merchantId}/deliveries`, {
      token: m.token,
      body: { dropoff: { location: QURUM, address: 'Qurum villa 7', contactName: 'Noor', contactPhone: '91234567' }, codAmountBaisa: 12500, packageDescription: 'Abaya' },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: 'merchant_delivery', status: 'ready_for_pickup', paymentMethod: 'cod', codAmountBaisa: 12500 });
    const [offer] = await pendingOffers(cap.token);
    expect(offer.codAmountBaisa).toBe(12500);
    await api('POST', `/captain/offers/${offer.id}/accept`, { token: cap.token });
    await api('POST', `/captain/deliveries/${r.body.delivery.id}/status`, { token: cap.token, body: { action: 'pickup' } });
    const mismatch = await api('POST', `/captain/deliveries/${r.body.delivery.id}/complete`, { token: cap.token, body: { pin: r.body.delivery.deliveryPin, codCollectedBaisa: 10000 } });
    expect(mismatch.body.error.code).toBe('cod_mismatch');
    await api('POST', `/captain/deliveries/${r.body.delivery.id}/complete`, { token: cap.token, body: { pin: r.body.delivery.deliveryPin } });
    const fin = (await api('GET', `/merchants/${m.merchantId}/finance`, { token: m.token })).body;
    expect(fin.balanceBaisa).toBe(12500 - r.body.deliveryFeeBaisa);
  });

  it('payment link with delivery: customer pays, courier is booked automatically', async () => {
    const m = await merchant({ location: KHUWAIR });
    const cap = await captain({ location: KHUWAIR });
    const link = await api('POST', `/merchants/${m.merchantId}/payment-links`, { token: m.token, body: { title: 'Abaya — size M', amountBaisa: 25000, requestDelivery: true, customerPhone: '92223333' } });
    expect(link.status).toBe(201);
    expect(link.body.whatsappShareUrl).toMatch(/^https:\/\/wa\.me\/96892223333\?text=/);
    const pub = await api('GET', `/pay/${link.body.code}`);
    expect(pub.body).toMatchObject({ amountBaisa: 25000, status: 'active', requestDelivery: true });
    expect((await api('POST', `/pay/${link.body.code}/checkout`, { body: {} })).status).toBe(400); // needs dropoff
    const co = await api('POST', `/pay/${link.body.code}/checkout`, { body: { customerName: 'Huda', dropoff: { location: QURUM, address: 'Qurum' } } });
    expect(co.status).toBe(200);
    await api('POST', `/mock-pay/${co.body.paymentId}/complete`, { body: { outcome: 'paid' } });
    const after = (await api('GET', `/merchants/${m.merchantId}/payment-links`, { token: m.token })).body.items[0];
    expect(after.status).toBe('paid');
    expect(after.orderId).toBeTruthy();
    const order = (await api('GET', `/merchants/${m.merchantId}/orders/${after.orderId}`, { token: m.token })).body;
    expect(order).toMatchObject({ type: 'merchant_delivery', source: 'payment_link', paymentStatus: 'paid', codAmountBaisa: 0, customerPhone: '+96892223333' });
    expect(await pendingOffers(cap.token)).toHaveLength(1);
    // paying an already-paid link is refused
    expect((await api('POST', `/pay/${link.body.code}/checkout`, { body: { dropoff: { location: QURUM } } })).status).toBe(409);
  });

  it('payment link without delivery credits the merchant on payment', async () => {
    const m = await merchant({ location: KHUWAIR, commissionBps: 500 });
    const link = (await api('POST', `/merchants/${m.merchantId}/payment-links`, { token: m.token, body: { title: 'Deposit', amountBaisa: 10000 } })).body;
    const co = await api('POST', `/pay/${link.code}/checkout`, { body: {} });
    await api('POST', `/mock-pay/${co.body.paymentId}/complete`, { body: { outcome: 'paid' } });
    expect((await api('GET', `/merchants/${m.merchantId}/finance`, { token: m.token })).body.balanceBaisa).toBe(10000 - 500);
  });
});

describe('dispatch engine', () => {
  async function c2cOrder(pickup = MSQ, extra: Record<string, unknown> = {}) {
    const s = await consumerWithAddress(pickup);
    const r = await api('POST', '/shipments', { token: s.token, body: { pickup: { location: pickup }, dropoff: { location: QURUM, contactPhone: '91112222' }, package: { size: 'small', description: 'Docs' }, paymentMethod: 'online', ...extra } });
    // online shipment waits for payment; pay it via mock to trigger dispatch
    const co = await api('POST', `/orders/${r.body.id}/checkout`, { token: s.token, body: {} });
    await api('POST', `/mock-pay/${co.body.paymentId}/complete`, { body: { outcome: 'paid' } });
    return { order: r.body, deliveryId: r.body.delivery.id as string, sender: s };
  }

  it('offers the nearest eligible captain first, then the next after rejection', async () => {
    const near = await captain({ location: { lat: 23.6090, lng: 58.4110 } });
    const far = await captain({ location: { lat: 23.6200, lng: 58.4200 } });
    await captain({ location: { lat: 23.6088, lng: 58.4108 }, online: false }); // offline — never offered
    const { deliveryId } = await c2cOrder();
    const o1 = await pendingOffers(near.token);
    expect(o1).toHaveLength(1);
    expect(await pendingOffers(far.token)).toHaveLength(0);
    expect((await api('POST', `/captain/offers/${o1[0].id}/reject`, { token: near.token, body: { reason: 'busy' } })).status).toBe(204);
    const o2 = await pendingOffers(far.token);
    expect(o2).toHaveLength(1);
    expect(o2[0].deliveryId).toBe(deliveryId);
  });

  it('expires offers and re-offers via the worker, expanding the radius until unassigned', async () => {
    const cap = await captain({ location: { lat: 23.6090, lng: 58.4110 } });
    const { deliveryId } = await c2cOrder();
    const [offer] = await pendingOffers(cap.token);
    await q(pool, `UPDATE delivery_offers SET expires_at = now() - interval '1 second' WHERE id = $1`, [offer.id]);
    const tick = await runDispatchJob();
    expect(tick.expired).toBe(1);
    expect((await one(pool, `SELECT status FROM delivery_offers WHERE id = $1`, [offer.id])).status).toBe('expired');
    // the only captain already had an offer → no more candidates; rounds run out → unassigned
    for (let i = 0; i < 8; i++) {
      await q(pool, `UPDATE deliveries SET updated_at = now() - interval '1 minute' WHERE id = $1`, [deliveryId]);
      await runDispatchJob();
    }
    const d = await one(pool, `SELECT status, dispatch_round, current_radius_km FROM deliveries WHERE id = $1`, [deliveryId]);
    expect(d.status).toBe('unassigned');
    expect(Number(d.current_radius_km)).toBe(10);
  });

  it('filters by vehicle for large parcels, zones, capacity and blackout windows', async () => {
    const bike = await captain({ vehicle: 'bike', location: MSQ });
    const car = await captain({ vehicle: 'car', location: { lat: 23.615, lng: 58.415 } });
    const s = await consumerWithAddress(MSQ);
    const r = await api('POST', '/shipments', { token: s.token, body: { pickup: { location: MSQ }, dropoff: { location: QURUM, contactPhone: '91112222' }, package: { size: 'large', description: 'Chair' }, paymentMethod: 'cod', codPayer: 'sender' } });
    expect(r.body.delivery.vehicleType).toBe('car');
    expect(await pendingOffers(bike.token)).toHaveLength(0);
    expect(await pendingOffers(car.token)).toHaveLength(1);

    // Blackout: bikes excluded when the rule's window covers "now"
    await q(pool, `UPDATE dispatch_rules SET bike_blackout = '[{"start":"00:00","end":"23:59"}]'`);
    const r2 = await api('POST', '/shipments', { token: s.token, body: { pickup: { location: MSQ }, dropoff: { location: QURUM, contactPhone: '91112222' }, package: { size: 'small', description: 'Docs' }, paymentMethod: 'cod', codPayer: 'sender' } });
    expect(await one(pool, `SELECT count(*)::int AS n FROM delivery_offers WHERE delivery_id = $1 AND captain_id = $2`, [r2.body.delivery.id, bike.captainId])).toEqual({ n: 0 });

    // Captain outside the delivery's zone is not offered
    await q(pool, `UPDATE dispatch_rules SET bike_blackout = '[]'`);
    const seebOnly = await captain({ location: MSQ, zones: ['MCT-SEEB'] });
    await api('POST', '/shipments', { token: s.token, body: { pickup: { location: MSQ }, dropoff: { location: QURUM, contactPhone: '91112222' }, package: { size: 'small', description: 'Docs' }, paymentMethod: 'cod', codPayer: 'sender' } });
    expect(await pendingOffers(seebOnly.token)).toHaveLength(0);
  });

  it('broadcast: two captains race, exactly one wins', async () => {
    await q(pool, `UPDATE dispatch_rules SET strategy = 'broadcast', broadcast_size = 3`);
    const a = await captain({ location: MSQ });
    const b = await captain({ location: { lat: 23.611, lng: 58.412 } });
    const { deliveryId } = await c2cOrder();
    const [oa] = await pendingOffers(a.token);
    const [ob] = await pendingOffers(b.token);
    const [ra, rb] = await Promise.all([
      api('POST', `/captain/offers/${oa.id}/accept`, { token: a.token }),
      api('POST', `/captain/offers/${ob.id}/accept`, { token: b.token }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect((await one(pool, `SELECT count(*)::int AS n FROM delivery_offers WHERE delivery_id = $1 AND status = 'accepted'`, [deliveryId])).n).toBe(1);
  });

  it('manual strategy queues for ops; dispatcher assigns a captain', async () => {
    await q(pool, `UPDATE dispatch_rules SET strategy = 'manual'`);
    const cap = await captain({ location: MSQ });
    const disp = await staff('dispatcher');
    const { deliveryId } = await c2cOrder();
    expect((await one(pool, `SELECT status FROM deliveries WHERE id = $1`, [deliveryId])).status).toBe('unassigned');
    const live = await api('GET', '/admin/operations/live', { token: disp.token });
    expect(live.body.kpis.unassigned).toBe(1);
    expect(live.body.captains.length).toBeGreaterThan(0);
    const r = await api('POST', `/admin/deliveries/${deliveryId}/assign`, { token: disp.token, body: { captainId: cap.captainId } });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('assigned');
    expect((await api('GET', `/captain/deliveries/${deliveryId}`, { token: cap.token })).body.status).toBe('assigned');
  });

  it('captain release before pickup returns the job to dispatch', async () => {
    const a = await captain({ location: MSQ });
    const b = await captain({ location: { lat: 23.62, lng: 58.42 } });
    const { deliveryId } = await c2cOrder();
    const [oa] = await pendingOffers(a.token);
    await api('POST', `/captain/offers/${oa.id}/accept`, { token: a.token });
    expect((await api('POST', `/captain/deliveries/${deliveryId}/status`, { token: a.token, body: { action: 'release' } })).status).toBe(400); // reason required
    await api('POST', `/captain/deliveries/${deliveryId}/status`, { token: a.token, body: { action: 'release', reason: 'flat tyre' } });
    expect(await pendingOffers(b.token)).toHaveLength(1);
    expect((await api('GET', `/captain/deliveries/${deliveryId}`, { token: a.token })).status).toBe(403);
  });
});
