import { pool, one, q, tx } from './db/pool.js';
import { notify } from './modules/notifications/service.js';
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
  return dispatchTick(pool);
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

/**
 * Subscription billing: for each active subscription whose period has ended, post the monthly fee to the merchant
 * ledger (deducted at settlement — no card charging, DECISIONS D-018) and roll the period forward. Idempotent per period.
 */
export async function runSubscriptionBilling() {
  let billed = 0;
  for (let guard = 0; guard < 12; guard++) {
    const due = await q(pool, `SELECT ms.id FROM merchant_subscriptions ms WHERE ms.status = 'active' AND ms.current_period_end <= now() LIMIT 200`);
    if (!due.length) break;
    for (const d of due) {
      await tx(async (c) => {
        const s = await one(c, `SELECT ms.*, p.monthly_fee_baisa, p.code, m.name_en FROM merchant_subscriptions ms JOIN subscription_plans p ON p.id = ms.plan_id
                                 JOIN merchants m ON m.id = ms.merchant_id WHERE ms.id = $1 AND ms.status = 'active' AND ms.current_period_end <= now() FOR UPDATE OF ms`, [d.id]);
        if (!s) return;
        const period = new Date(s.current_period_end).toISOString().slice(0, 10);
        if (s.monthly_fee_baisa > 0) {
          await q(c, `INSERT INTO ledger_entries (account_type, account_id, entry_type, amount_baisa, description) VALUES ('merchant',$1,'subscription_fee',$2,$3), ('platform',NULL,'subscription_fee',$4,$3)`,
            [s.merchant_id, -s.monthly_fee_baisa, `Plan ${s.code} — period ending ${period}`, s.monthly_fee_baisa]);
          billed++;
        }
        await q(c, `UPDATE merchant_subscriptions SET current_period_end = current_period_end + interval '1 month', last_billed_at = now() WHERE id = $1`, [s.id]);
      });
    }
  }
  return billed;
}

/** Remind captains before an approved document expires (expired documents already block going online and dispatch). */
export async function runDocumentExpiryReminders() {
  const s = await getSettings(pool);
  const docs = await q(pool, `SELECT cd.id, cd.doc_type, cd.expires_at, c.user_id FROM captain_documents cd JOIN captains c ON c.id = cd.captain_id
      WHERE cd.status = 'approved' AND cd.expiry_notified_at IS NULL AND cd.expires_at IS NOT NULL
        AND cd.expires_at <= (now() AT TIME ZONE 'Asia/Muscat')::date + $1::int LIMIT 500`, [s.captainDocumentExpiryNoticeDays]);
  for (const d of docs) {
    await tx(async (c) => {
      await notify(c, d.user_id, 'captain.document_expiring', { docType: d.doc_type.replace(/_/g, ' '), expiresAt: d.expires_at });
      await q(c, `UPDATE captain_documents SET expiry_notified_at = now() WHERE id = $1`, [d.id]);
    });
  }
  return docs.length;
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
  every(3_600_000, 'subscription-billing', runSubscriptionBilling);
  every(3_600_000, 'document-expiry-reminders', runDocumentExpiryReminders);
  log('[worker] started');
  return () => timers.forEach(clearInterval);
}

