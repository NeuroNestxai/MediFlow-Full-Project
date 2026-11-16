import { pool, q, tx } from './db/pool.js';
import { getSettings } from './modules/core/settings.js';
import { dispatchTick } from './modules/dispatch/service.js';
import { cancelOrder } from './modules/orders/service.js';

/**
 * Background jobs. Every job is idempotent and uses row locks / SKIP LOCKED so several workers can run.
 *  - dispatch: expire offers, re-offer, widen radius (every 2 s)
 *  - order timeouts: unpaid online orders and merchant-unaccepted orders are cancelled (every 30 s)
 *  - housekeeping: prune realtime outbox, OTPs, stale captain presence (every 10 min)
 */
export async function runDispatchJob() {
  return tx((c) => dispatchTick(c));
}

export async function runOrderTimeouts() {
  const s = await getSettings(pool);
  const stale = await q(
    pool,
    `SELECT id, status FROM orders
      WHERE (status = 'pending_payment' AND created_at < now() - make_interval(mins => $1))
         OR (type = 'marketplace' AND status = 'placed' AND placed_at < now() - make_interval(mins => $2))
      LIMIT 100`,
    [s.pendingPaymentTimeoutMinutes, s.merchantAcceptTimeoutMinutes],
  );
  for (const o of stale) {
    await tx((c) => cancelOrder(c, o.id, null, o.status === 'pending_payment' ? 'Payment not completed in time' : 'Store did not accept the order in time')).catch((e) =>
      console.error('order timeout failed', o.id, e.message),
    );
  }
  return stale.length;
}

export async function runHousekeeping() {
  await q(pool, `DELETE FROM realtime_events WHERE created_at < now() - interval '24 hours'`);
  await q(pool, `DELETE FROM otp_codes WHERE created_at < now() - interval '24 hours'`);
  await q(pool, `UPDATE captains c SET is_online = false FROM captain_locations cl WHERE cl.captain_id = c.id AND c.is_online AND cl.updated_at < now() - interval '30 minutes'`);
  await q(pool, `DELETE FROM delivery_tracks WHERE recorded_at < now() - interval '90 days'`);
}

export function startWorker(log: (m: string) => void = console.log) {
  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    let running = false;
    timers.push(setInterval(async () => {
      if (running) return;
      running = true;
      try { await fn(); } catch (e) { log(`[worker] ${name} failed: ${(e as Error).message}`); } finally { running = false; }
    }, ms));
  };
  every(2000, 'dispatch', runDispatchJob);
  every(30_000, 'order-timeouts', runOrderTimeouts);
  every(600_000, 'housekeeping', runHousekeeping);
  log('[worker] started');
  return () => timers.forEach(clearInterval);
}

