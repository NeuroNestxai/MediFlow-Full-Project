#!/usr/bin/env node
/**
 * Load test (autocannon) against a running, seeded Qabnah API. Run the API with a high RATE_LIMIT_PER_MINUTE,
 * otherwise the per-IP limiter (default 300/min) answers 429 — that is the limiter working, not capacity.
 *
 *   node scripts/loadtest.mjs [baseUrl] [durationSeconds]
 *
 * Scenarios: public store discovery, delivery quotes (PostGIS zone lookup + pricing), and captain location pings
 * (authenticated write path: upsert location, track breadcrumbs, realtime outbox).
 */
import autocannon from 'autocannon';

const BASE = process.argv[2] ?? 'http://localhost:4000/v1';
const DURATION = Number(process.argv[3] ?? 15);

async function captainToken() {
  const phone = '+96890001001';
  const r = await (await fetch(`${BASE}/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) })).json();
  if (!r.devCode) throw new Error(`need OTP_DEV_ECHO=true (${JSON.stringify(r)})`);
  const v = await (await fetch(`${BASE}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code: r.devCode }) })).json();
  return v.accessToken;
}

function run(title, opts) {
  return new Promise((resolve, reject) => {
    autocannon({ duration: DURATION, connections: 50, ...opts }, (err, res) => {
      if (err) return reject(err);
      const row = {
        scenario: title, connections: opts.connections ?? 50, 'req/s (avg)': Math.round(res.requests.average),
        'p50 ms': res.latency.p50, 'p97.5 ms': res.latency.p97_5, 'p99 ms': res.latency.p99, '2xx': res['2xx'], 'non-2xx': res.non2xx, errors: res.errors, timeouts: res.timeouts,
      };
      resolve(row);
    });
  });
}

const token = await captainToken();
const results = [];
results.push(await run('GET /stores near Khuwair (public)', { url: `${BASE}/stores?lat=23.59&lng=58.44` }));
results.push(await run('POST /quotes/delivery (c2c)', {
  url: `${BASE}/quotes/delivery`, method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'c2c', pickup: { lat: 23.6085, lng: 58.4105 }, dropoff: { lat: 23.6105, lng: 58.4802 } }),
}));
results.push(await run('POST /captain/location (auth write)', {
  url: `${BASE}/captain/location`, method: 'POST', connections: 20,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ lat: 23.59, lng: 58.43, heading: 90, speed: 6 }),
}));
console.table(results);
