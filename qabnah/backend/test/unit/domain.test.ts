import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { hmacHex } from '../../src/lib/crypto.js';
import { estimateRoute, haversineM } from '../../src/lib/geo.js';
import { applyBps, formatOMR, roundBaisa, vatIncluded } from '../../src/lib/money.js';
import { maskPhone, normalizeOmanPhone } from '../../src/lib/phone.js';
import { validateOptions } from '../../src/modules/catalog/service.js';
import { computeFee } from '../../src/modules/core/pricing.js';
import { canTransition, captainNextActions, DELIVERY_TRANSITIONS, ORDER_TRANSITIONS } from '../../src/modules/core/state.js';
import { inBlackout, isWithinOpeningHours, muscatNow } from '../../src/modules/core/time.js';
import { radiusForRound, scoreCandidate } from '../../src/modules/dispatch/service.js';
import { deliveryPostings } from '../../src/modules/finance/ledger.js';
import { verifyMetaSignature } from '../../src/integrations/whatsapp.js';
import { mapThawaniStatus } from '../../src/integrations/payments/thawani.js';

describe('money (baisa)', () => {
  it('rounds half up and handles VAT-inclusive amounts', () => {
    expect(roundBaisa(1.5)).toBe(2);
    expect(roundBaisa(-1.5)).toBe(-2);
    expect(vatIncluded(1050, 500)).toBe(50); // 1.050 OMR incl. 5% VAT contains 0.050
    expect(vatIncluded(1000, 500)).toBe(48); // 47.619 → 48
    expect(applyBps(12345, 1000)).toBe(1235);
  });
  it('formats OMR with three decimals', () => {
    expect(formatOMR(2500)).toBe('OMR 2.500');
    expect(formatOMR(5)).toBe('OMR 0.005');
    expect(formatOMR(-1250)).toBe('-OMR 1.250');
  });
});

describe('phone numbers', () => {
  it('normalises Omani mobiles to E.164', () => {
    expect(normalizeOmanPhone('91234567')).toBe('+96891234567');
    expect(normalizeOmanPhone('+968 7123 4567')).toBe('+96871234567');
    expect(normalizeOmanPhone('0096891234567')).toBe('+96891234567');
    expect(normalizeOmanPhone('٩١٢٣٤٥٦٧')).toBe('+96891234567');
  });
  it('rejects non-mobile numbers', () => {
    expect(() => normalizeOmanPhone('24123456')).toThrow();
    expect(() => normalizeOmanPhone('+97150123456')).toThrow();
  });
  it('masks phones', () => expect(maskPhone('+96891234567')).toBe('+968****567'));
});

describe('delivery fee formula', () => {
  const rule = { id: 'r', base_fee_baisa: 700, per_km_baisa: 100, included_km: 3, min_fee_baisa: 700, max_fee_baisa: 3000, max_distance_km: 25, surge_multiplier: 1, captain_share_bps: 8000 };
  it('charges the base fee inside the included distance', () => expect(computeFee(rule, 2000)).toEqual({ feeBaisa: 700, captainEarningBaisa: 560 }));
  it('adds per-km beyond included distance, rounded to 10 baisa', () => expect(computeFee(rule, 7550).feeBaisa).toBe(1160));
  it('applies surge and caps at max fee', () => {
    expect(computeFee({ ...rule, surge_multiplier: 1.5 }, 5000).feeBaisa).toBe(1350);
    expect(computeFee(rule, 60_000).feeBaisa).toBe(3000);
  });
  it('enforces the minimum fee', () => expect(computeFee({ ...rule, base_fee_baisa: 100, min_fee_baisa: 900 }, 1000).feeBaisa).toBe(900));
});

describe('geo', () => {
  it('computes haversine distance Khuwair→Qurum ≈ 5 km', () => {
    const d = haversineM({ lat: 23.5885, lng: 58.4362 }, { lat: 23.6105, lng: 58.4802 });
    expect(d).toBeGreaterThan(4800);
    expect(d).toBeLessThan(5200);
  });
  it('bike routes are longer than car routes (main-road restrictions)', () => {
    const a = { lat: 23.5885, lng: 58.4362 }, b = { lat: 23.6105, lng: 58.4802 };
    expect(estimateRoute(a, b, 'bike').distanceM).toBeGreaterThan(estimateRoute(a, b, 'car').distanceM);
  });
});

describe('state machines', () => {
  it('allows the happy path for orders', () => {
    const path = ['pending_payment', 'placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(ORDER_TRANSITIONS, path[i], path[i + 1])).toBe(true);
  });
  it('blocks illegal order transitions', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'delivered', 'cancelled')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'placed', 'delivered')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'cancelled', 'placed')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'out_for_delivery', 'accepted')).toBe(false);
  });
  it('every status in the delivery map is reachable and terminal states have no exits', () => {
    for (const t of ['delivered', 'returned', 'cancelled']) expect(DELIVERY_TRANSITIONS[t]).toEqual([]);
    expect(canTransition(DELIVERY_TRANSITIONS, 'picked_up', 'cancelled')).toBe(false); // cannot cancel after pickup
  });
  it('drives captain app buttons', () => {
    expect(captainNextActions('assigned')).toContain('release');
    expect(captainNextActions('picked_up')).toEqual(['arrive_dropoff', 'complete', 'fail']);
    expect(captainNextActions('delivered')).toEqual([]);
  });
});

describe('opening hours & blackout windows (Muscat UTC+4)', () => {
  const at = (iso: string) => new Date(iso);
  it('computes Muscat local time', () => expect(muscatNow(at('2026-11-16T20:30:00Z'))).toMatchObject({ hhmm: '00:30', weekday: 2 }));
  it('handles windows that cross midnight', () => {
    const hours = [{ weekday: 1, open: '18:00', close: '02:00' }]; // Monday evening → Tuesday 02:00
    expect(isWithinOpeningHours(hours, at('2026-11-16T15:00:00Z'))).toBe(true); // Mon 19:00
    expect(isWithinOpeningHours(hours, at('2026-11-16T21:00:00Z'))).toBe(true); // Tue 01:00
    expect(isWithinOpeningHours(hours, at('2026-11-16T23:00:00Z'))).toBe(false); // Tue 03:00
    expect(isWithinOpeningHours([], at('2026-11-16T23:00:00Z'))).toBe(true);
  });
  it('applies the summer midday bike blackout', () => {
    const w = [{ months: [6, 7, 8], start: '12:30', end: '15:30' }];
    expect(inBlackout(w, at('2026-07-01T09:00:00Z'))).toBe(true); // 13:00 Muscat in July
    expect(inBlackout(w, at('2026-11-01T09:00:00Z'))).toBe(false); // November
    expect(inBlackout(w, at('2026-07-01T12:00:00Z'))).toBe(false); // 16:00
  });
});

describe('product options validation', () => {
  const product: any = {
    basePriceBaisa: 900,
    optionGroups: [
      { id: 'g1', kind: 'variant', nameEn: 'Size', nameAr: 'الحجم', minSelect: 1, maxSelect: 1, options: [{ id: 's', nameEn: 'S', nameAr: 'ص', priceDeltaBaisa: 0, isAvailable: true }, { id: 'l', nameEn: 'L', nameAr: 'ك', priceDeltaBaisa: 400, isAvailable: true }] },
      { id: 'g2', kind: 'addon', nameEn: 'Extras', nameAr: 'إضافات', minSelect: 0, maxSelect: 2, options: [{ id: 'a', nameEn: 'A', nameAr: 'أ', priceDeltaBaisa: 100, isAvailable: true }, { id: 'b', nameEn: 'B', nameAr: 'ب', priceDeltaBaisa: 100, isAvailable: true }, { id: 'c', nameEn: 'C', nameAr: 'ج', priceDeltaBaisa: 100, isAvailable: false }] },
    ],
  };
  it('requires exactly one variant', () => {
    expect(validateOptions(product, []).ok).toBe(false);
    expect(validateOptions(product, ['s', 'l']).ok).toBe(false);
    expect(validateOptions(product, ['l']).ok).toBe(true);
  });
  it('enforces add-on max and availability, rejects foreign options and duplicates', () => {
    expect(validateOptions(product, ['s', 'a', 'b']).ok).toBe(true);
    expect(validateOptions(product, ['s', 'c']).ok).toBe(false);
    expect(validateOptions(product, ['s', 'zzz']).ok).toBe(false);
    expect(validateOptions(product, ['s', 'a', 'a']).ok).toBe(false);
  });
  it('returns price deltas for the selection', () => {
    const r = validateOptions(product, ['l', 'a']);
    expect(r.ok && r.selected.reduce((s, o) => s + o.priceDeltaBaisa, 0)).toBe(500);
  });
});

describe('dispatch scoring', () => {
  const rule: any = { search_radius_km: 3, radius_step_km: 2, max_radius_km: 10, weight_distance: 0.6, weight_rating: 0.2, weight_acceptance: 0.2 };
  it('expands radius per round up to the max', () => {
    expect(radiusForRound(rule, 1)).toBe(3);
    expect(radiusForRound(rule, 3)).toBe(7);
    expect(radiusForRound(rule, 10)).toBe(10);
  });
  it('prefers closer captains, all else equal', () => {
    const near = scoreCandidate(rule, { distance_m: 500, rating_avg: 4.5, acceptance: 0.9 }, 3000);
    const far = scoreCandidate(rule, { distance_m: 2500, rating_avg: 4.5, acceptance: 0.9 }, 3000);
    expect(near).toBeGreaterThan(far);
  });
});

describe('ledger postings', () => {
  const sum = (es: any[], type: string) => es.filter((e) => e.account.type === type).reduce((s, e) => s + e.amount, 0);
  const d = { captain_id: 'c', fee_baisa: 1000, captain_earning_baisa: 800, cod_amount_baisa: 0 };
  it('marketplace COD: captain owes total minus earning; merchant gets goods minus commission', () => {
    const o = { type: 'marketplace', merchant_id: 'm', number: 'QB1', total_baisa: 6100, delivery_fee_baisa: 1000, service_fee_baisa: 100, discount_baisa: 0, commission_baisa: 500, payment_method: 'cod' };
    const es = deliveryPostings(o, d);
    expect(sum(es, 'merchant')).toBe(5000 - 500);
    expect(sum(es, 'captain')).toBe(800 - 6100);
    expect(sum(es, 'platform')).toBe(500 + 200 + 100);
    // Cash conservation: what the captain owes = what merchant + platform + captain earning are owed.
    expect(-sum(es, 'captain')).toBe(sum(es, 'merchant') + sum(es, 'platform'));
  });
  it('merchant delivery with COD collects cash for the merchant and charges the fee', () => {
    const o = { type: 'merchant_delivery', merchant_id: 'm', number: 'QB2', payment_method: 'cod', commission_baisa: 0 };
    const es = deliveryPostings(o, { ...d, cod_amount_baisa: 12000 });
    expect(sum(es, 'merchant')).toBe(12000 - 1000);
    expect(sum(es, 'captain')).toBe(800 - 12000);
  });
  it('c2c paid online only pays the captain', () => {
    const es = deliveryPostings({ type: 'c2c', number: 'QB3', payment_method: 'online' }, d);
    expect(sum(es, 'captain')).toBe(800);
    expect(sum(es, 'platform')).toBe(200);
    expect(es.some((e) => e.account.type === 'merchant')).toBe(false);
  });
});

describe('integrations', () => {
  it('verifies Meta X-Hub-Signature-256', () => {
    const body = '{"entry":[]}';
    expect(verifyMetaSignature(body, `sha256=${hmacHex('secret', body)}`, 'secret')).toBe(true);
    expect(verifyMetaSignature(body, `sha256=${hmacHex('other', body)}`, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, `sha256=${hmacHex('secret', body)}`, undefined)).toBe(false);
  });
  it('maps Thawani session statuses', () => {
    expect(mapThawaniStatus('paid')).toBe('paid');
    expect(mapThawaniStatus('unpaid')).toBe('pending');
    expect(mapThawaniStatus('cancelled')).toBe('cancelled');
  });
});

describe('configuration safety', () => {
  it('refuses unsafe production configuration', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', OTP_DEV_ECHO: 'true' } as any)).toThrow(/Unsafe production configuration/);
  });
  it('accepts a complete production configuration', () => {
    expect(() => loadConfig({
      NODE_ENV: 'production', PAYMENT_PROVIDER: 'thawani', THAWANI_SECRET_KEY: 'x', THAWANI_PUBLISHABLE_KEY: 'y', SMS_PROVIDER: 'http',
      JWT_SECRET: 'a'.repeat(40), OTP_PEPPER: 'p', FILE_SIGNING_SECRET: 'f',
    } as any)).not.toThrow();
  });
});
