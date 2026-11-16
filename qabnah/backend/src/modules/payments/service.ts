import { config } from '../../config.js';
import { one, q, type Queryable } from '../../db/pool.js';
import { activeProvider, providers } from '../../integrations/payments/index.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { applyBps } from '../../lib/money.js';
import { waShareUrl } from '../../integrations/whatsapp.js';
import { getSettings } from '../core/settings.js';
import { postEntry, postPaymentLinkSale } from '../finance/ledger.js';
import { effectiveCommissionBps, getMerchant, merchantUserIds } from '../merchants/service.js';
import { notifyMany } from '../notifications/service.js';
import { createMerchantDelivery, onOrderPlaced, transitionOrder } from '../orders/service.js';
import type pg from 'pg';

export const paymentReturnUrl = (paymentId: string, outcome: 'success' | 'cancel', returnUrl?: string) =>
  returnUrl ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}paymentId=${paymentId}&outcome=${outcome}` : `${config.PUBLIC_API_URL}/v1/payments/return?paymentId=${paymentId}&outcome=${outcome}`;

export async function createOrderCheckout(db: Queryable, orderId: string, userId: string, returnUrl?: string) {
  const o = await one(db, `SELECT * FROM orders WHERE id = $1 AND customer_user_id = $2 FOR UPDATE`, [orderId, userId]);
  if (!o) throw notFound('Order');
  if (o.status !== 'pending_payment' || o.payment_method !== 'online') throw conflict('This order does not need online payment', 'not_payable');
  const provider = activeProvider();
  const payment = await one(db, `INSERT INTO payments (order_id, provider, amount_baisa, status) VALUES ($1,$2,$3,'created') RETURNING id`, [orderId, provider.name, o.total_baisa]);
  const r = await provider.createCheckout({
    paymentId: payment.id, amountBaisa: o.total_baisa, reference: o.number, productName: `Qabnah ${o.number}`,
    customerName: o.customer_name, customerPhone: o.customer_phone,
    successUrl: paymentReturnUrl(payment.id, 'success', returnUrl), cancelUrl: paymentReturnUrl(payment.id, 'cancel', returnUrl),
  }, db);
  await q(db, `UPDATE payments SET provider_ref = $2, checkout_url = $3, raw = $4, status = 'pending', updated_at = now() WHERE id = $1`, [payment.id, r.providerRef, r.checkoutUrl, JSON.stringify(r.raw ?? {})]);
  await q(db, `UPDATE orders SET payment_status = 'pending' WHERE id = $1`, [orderId]);
  return { paymentId: payment.id, provider: provider.name, checkoutUrl: r.checkoutUrl, status: 'pending' };
}

/**
 * Confirm a payment by asking the provider (never trust redirects or webhook bodies alone) and apply side effects once.
 */
export async function syncPayment(db: pg.PoolClient, paymentId: string) {
  const p = await one(db, `SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
  if (!p) throw notFound('Payment');
  if (['paid', 'refunded', 'partially_refunded', 'failed', 'cancelled', 'expired'].includes(p.status)) return p.status;
  const provider = providers[p.provider];
  const r = await provider.retrieve(p.provider_ref, db);
  if (r.status === 'pending') return 'pending';
  if (r.status !== 'paid') {
    await q(db, `UPDATE payments SET status = $2, updated_at = now() WHERE id = $1`, [paymentId, r.status]);
    if (p.order_id) await q(db, `UPDATE orders SET payment_status = 'failed' WHERE id = $1 AND payment_status <> 'paid'`, [p.order_id]);
    return r.status;
  }
  await q(db, `UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`, [paymentId]);
  if (p.order_id) {
    const o = await one(db, `SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [p.order_id]);
    await q(db, `UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [o.id]);
    if (o.status === 'pending_payment') {
      await transitionOrder(db, o.id, 'placed', null, 'payment confirmed');
      await onOrderPlaced(db, o.id, null);
    } else if (o.status === 'cancelled') {
      // Paid after the order expired: refund automatically.
      await refundOrderPayments(db, o.id, 'Payment received after order was cancelled', null);
    }
  }
  if (p.payment_link_id) await onPaymentLinkPaid(db, p);
  return 'paid';
}

export async function refundOrderPayments(db: Queryable, orderId: string, reason: string, actor: string | null, amountBaisa?: number) {
  const payments = await q(db, `SELECT * FROM payments WHERE order_id = $1 AND status IN ('paid','partially_refunded') ORDER BY created_at`, [orderId]);
  if (!payments.length) return [];
  let remaining = amountBaisa ?? payments.reduce((s, p) => s + p.amount_baisa - p.refunded_baisa, 0);
  const out = [];
  for (const p of payments) {
    if (remaining <= 0) break;
    const refundable = p.amount_baisa - p.refunded_baisa;
    const amt = Math.min(refundable, remaining);
    if (amt <= 0) continue;
    const r = await providers[p.provider].refund(p.provider_ref, amt, reason);
    const refund = await one(db, `INSERT INTO refunds (payment_id, order_id, amount_baisa, reason, status, provider_ref, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [
      p.id, orderId, amt, reason, r.status, r.providerRef, actor,
    ]);
    const refunded = p.refunded_baisa + amt;
    await q(db, `UPDATE payments SET refunded_baisa = $2, status = $3, updated_at = now() WHERE id = $1`, [p.id, refunded, refunded >= p.amount_baisa ? 'refunded' : 'partially_refunded']);
    await postEntry(db, { type: 'platform', id: null }, 'refund', -amt, `Refund ${reason}`.slice(0, 200), actor, orderId);
    remaining -= amt;
    out.push(refund);
  }
  const totals = await one(db, `SELECT SUM(amount_baisa)::int AS paid, SUM(refunded_baisa)::int AS refunded FROM payments WHERE order_id = $1 AND status IN ('paid','partially_refunded','refunded')`, [orderId]);
  await q(db, `UPDATE orders SET payment_status = $2 WHERE id = $1`, [orderId, totals.refunded >= totals.paid ? 'refunded' : 'partially_refunded']);
  return out;
}

// ─────────────── Payment links ───────────────

export function paymentLinkDto(l: any) {
  const url = `${config.MERCHANT_WEB_URL}/pay/${l.code}`;
  return {
    id: l.id, code: l.code, url,
    whatsappShareUrl: waShareUrl(`${l.title} — OMR ${(l.amount_baisa / 1000).toFixed(3)}\n${url}`, l.customer_phone),
    title: l.title, description: l.description, amountBaisa: l.amount_baisa, status: effectiveLinkStatus(l), customerName: l.customer_name,
    customerPhone: l.customer_phone, requestDelivery: l.request_delivery, expiresAt: l.expires_at, paidAt: l.paid_at, orderId: l.order_id, createdAt: l.created_at,
  };
}

export const effectiveLinkStatus = (l: any) => (l.status === 'active' && l.expires_at && new Date(l.expires_at) < new Date() ? 'expired' : l.status);

export async function startPaymentLinkCheckout(db: Queryable, code: string, input: { customerName?: string; customerPhone?: string; dropoff?: any }) {
  const l = await one(db, `SELECT pl.*, m.name_en, m.status AS merchant_status FROM payment_links pl JOIN merchants m ON m.id = pl.merchant_id WHERE pl.code = $1 FOR UPDATE OF pl`, [code]);
  if (!l) throw notFound('Payment link');
  if (effectiveLinkStatus(l) !== 'active') throw conflict('This payment link is no longer active', 'link_inactive');
  if (l.merchant_status !== 'active') throw conflict('This store is not active', 'merchant_unavailable');
  if (l.request_delivery && !input.dropoff?.location) throw badRequest('A delivery location is required');
  const provider = activeProvider();
  const payment = await one(db, `INSERT INTO payments (payment_link_id, provider, amount_baisa, status, raw) VALUES ($1,$2,$3,'created',$4) RETURNING id`, [
    l.id, provider.name, l.amount_baisa, JSON.stringify({ checkoutInput: input }),
  ]);
  const ret = `${config.MERCHANT_WEB_URL}/pay/${code}`;
  const r = await provider.createCheckout({
    paymentId: payment.id, amountBaisa: l.amount_baisa, reference: `PL-${l.code}`, productName: l.title,
    customerName: input.customerName ?? l.customer_name, customerPhone: input.customerPhone ?? l.customer_phone,
    successUrl: paymentReturnUrl(payment.id, 'success', ret), cancelUrl: paymentReturnUrl(payment.id, 'cancel', ret),
  }, db);
  await q(db, `UPDATE payments SET provider_ref = $2, checkout_url = $3, raw = raw || $4::jsonb, status = 'pending', updated_at = now() WHERE id = $1`, [
    payment.id, r.providerRef, r.checkoutUrl, JSON.stringify({ provider: r.raw ?? {} }),
  ]);
  return { paymentId: payment.id, provider: provider.name, checkoutUrl: r.checkoutUrl, status: 'pending' };
}

async function onPaymentLinkPaid(db: pg.PoolClient, payment: any) {
  const l = await one(db, `SELECT * FROM payment_links WHERE id = $1 FOR UPDATE`, [payment.payment_link_id]);
  if (l.status === 'paid') return;
  const m = await getMerchant(db, l.merchant_id);
  const settings = await getSettings(db);
  const commission = applyBps(l.amount_baisa, effectiveCommissionBps(m, settings.defaultCommissionBps));
  const input = (await one(db, `SELECT raw FROM payments WHERE id = $1`, [payment.id])).raw?.checkoutInput ?? {};
  let orderId: string | null = null;
  if (l.request_delivery && input.dropoff?.location) {
    orderId = await createMerchantDelivery(db, null, l.merchant_id, {
      dropoff: { ...input.dropoff, contactName: input.dropoff.contactName ?? input.customerName ?? l.customer_name, contactPhone: input.dropoff.contactPhone ?? input.customerPhone ?? l.customer_phone },
      packageDescription: l.title, source: 'payment_link', prepaidOnlineBaisa: l.amount_baisa, commissionBaisa: commission,
    });
    await q(db, `UPDATE payments SET order_id = $2 WHERE id = $1`, [payment.id, orderId]);
  } else {
    await postPaymentLinkSale(db, l.merchant_id, l.amount_baisa, commission, l.code);
  }
  await q(db, `UPDATE payment_links SET status = 'paid', paid_at = now(), order_id = $2 WHERE id = $1`, [l.id, orderId]);
  await notifyMany(db, await merchantUserIds(db, l.merchant_id, 'merchant.payment_links:manage'), 'payment_link.paid', { title: l.title, code: l.code });
}
