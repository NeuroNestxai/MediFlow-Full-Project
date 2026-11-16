import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool, one, q, tx } from '../../db/pool.js';
import { requireMerchantPerm } from '../../lib/auth.js';
import { sha256, shortCode } from '../../lib/crypto.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { normalizeOmanPhone } from '../../lib/phone.js';
import { parse, zUuid } from '../../lib/validate.js';
import { zPlace } from '../orders/routes.js';
import { effectiveLinkStatus, paymentLinkDto, startPaymentLinkCheckout, syncPayment } from './service.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <style>body{font-family:system-ui,sans-serif;background:#FBF7EF;color:#0B1F1C;display:grid;place-items:center;min-height:100vh;margin:0}
  main{background:#fff;border:1px solid #E4E1D8;border-radius:20px;padding:28px;max-width:380px;width:calc(100% - 32px);text-align:center}
  h1{font-size:20px;margin:0 0 8px}.amt{font-size:32px;font-weight:800;color:#0E7C66;margin:16px 0}.note{color:#5B6B68;font-size:13px}
  button{width:100%;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:700;margin-top:10px;cursor:pointer}
  .pay{background:#0E7C66;color:#fff}.fail{background:#F3EFE6;color:#0B1F1C}.badge{display:inline-block;background:#F4A300;color:#0B1F1C;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700}</style></head>
  <body><main>${body}</main></body></html>`;

export default async function paymentRoutes(app: FastifyInstance) {
  // ── Mock gateway (development & tests only) ──
  app.get('/mock-pay/:paymentId', async (req, reply) => {
    if (config.PAYMENT_PROVIDER !== 'mock' && config.NODE_ENV === 'production') throw notFound('Page');
    const { paymentId } = parse(z.object({ paymentId: zUuid }), req.params);
    const p = await one(pool, `SELECT * FROM payments WHERE id = $1 AND provider = 'mock'`, [paymentId]);
    if (!p) throw notFound('Payment');
    reply.type('text/html');
    return page('Mock payment', `<span class="badge">TEST MODE — no real money</span><h1>Qabnah test checkout</h1>
      <div class="amt">OMR ${(p.amount_baisa / 1000).toFixed(3)}</div>
      <p class="note">This simulated gateway is used for development. Status: ${esc(p.status)}</p>
      <button class="pay" onclick="go('paid')">Pay (simulate success)</button><button class="fail" onclick="go('failed')">Decline (simulate failure)</button>
      <script>async function go(o){const r=await fetch(location.pathname+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({outcome:o})});const j=await r.json();if(j.redirectUrl)location.href=j.redirectUrl;else document.querySelector('main').innerHTML='<h1>'+j.status+'</h1>';}</script>`);
  });

  app.post('/mock-pay/:paymentId/complete', async (req) => {
    if (config.PAYMENT_PROVIDER !== 'mock' && config.NODE_ENV === 'production') throw notFound('Page');
    const { paymentId } = parse(z.object({ paymentId: zUuid }), req.params);
    const { outcome } = parse(z.object({ outcome: z.enum(['paid', 'failed']) }), req.body);
    const p = await one(pool, `UPDATE payments SET raw = raw || jsonb_build_object('mockOutcome', $2::text) WHERE id = $1 AND provider = 'mock' RETURNING raw`, [paymentId, outcome]);
    if (!p) throw notFound('Payment');
    const status = await tx((c) => syncPayment(c, paymentId));
    const raw = p.raw ?? {};
    const redirectUrl = (status === 'paid' ? raw.successUrl ?? raw.provider?.successUrl : raw.cancelUrl ?? raw.provider?.cancelUrl) ?? null;
    return { status, redirectUrl };
  });

  // Generic return page for apps (they poll the order status; this just tells the user to go back).
  app.get('/payments/return', async (req, reply) => {
    const qs = parse(z.object({ paymentId: zUuid, outcome: z.enum(['success', 'cancel']) }), req.query);
    const status = await tx((c) => syncPayment(c, qs.paymentId)).catch(() => 'unknown');
    reply.type('text/html');
    return page('Payment', `<h1>${status === 'paid' ? 'Payment received ✓ تم الدفع' : 'Payment not completed — لم يكتمل الدفع'}</h1><p class="note">You can return to the Qabnah app. يمكنك العودة إلى تطبيق قبناه.</p>`);
  });

  app.get('/payments/:paymentId', async (req) => {
    const { paymentId } = parse(z.object({ paymentId: zUuid }), req.params);
    const status = await tx((c) => syncPayment(c, paymentId));
    const p = await one(pool, `SELECT id, status, amount_baisa, order_id FROM payments WHERE id = $1`, [paymentId]);
    return { paymentId: p.id, status, amountBaisa: p.amount_baisa, orderId: p.order_id };
  });

  // ── Webhooks: treat bodies only as a trigger; confirm with the provider (DECISIONS D-017). ──
  app.post('/webhooks/payments/:provider', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(['thawani', 'mock']) }), req.params);
    const body: any = req.body ?? {};
    const ref: string | undefined = provider === 'thawani' ? body?.data?.session_id ?? body?.session_id : body?.providerRef;
    const eventKey = sha256(JSON.stringify(body));
    const ins = await q(pool, `INSERT INTO payment_webhook_events (provider, event_key, payload, signature_valid) VALUES ($1,$2,$3,false) ON CONFLICT DO NOTHING RETURNING id`, [provider, eventKey, JSON.stringify(body)]);
    if (!ins.length) return { received: true, duplicate: true };
    const p = ref ? await one(pool, `SELECT id FROM payments WHERE provider = $1 AND provider_ref = $2`, [provider, ref]) : null;
    if (!p) {
      await q(pool, `UPDATE payment_webhook_events SET error = 'unknown payment', processed_at = now() WHERE id = $1`, [ins[0].id]);
      return { received: true };
    }
    try {
      const status = await tx((c) => syncPayment(c, p.id));
      await q(pool, `UPDATE payment_webhook_events SET processed_at = now() WHERE id = $1`, [ins[0].id]);
      return { received: true, status };
    } catch (e) {
      await q(pool, `UPDATE payment_webhook_events SET error = $2 WHERE id = $1`, [ins[0].id, (e as Error).message]);
      throw new AppError(500, 'webhook_processing_failed', 'Webhook could not be processed; it can be retried');
    }
  });

  // ── Public payment link page ──
  app.get('/pay/:code', async (req) => {
    const { code } = parse(z.object({ code: z.string().max(20) }), req.params);
    const l = await one(pool, `SELECT pl.*, m.name_en, m.name_ar, m.logo_url, m.brand_color, m.slug FROM payment_links pl JOIN merchants m ON m.id = pl.merchant_id WHERE pl.code = $1`, [code]);
    if (!l) throw notFound('Payment link');
    return {
      code: l.code, title: l.title, description: l.description, amountBaisa: l.amount_baisa, status: effectiveLinkStatus(l), requestDelivery: l.request_delivery,
      expiresAt: l.expires_at, customerName: l.customer_name,
      merchant: { nameEn: l.name_en, nameAr: l.name_ar, logoUrl: l.logo_url, brandColor: l.brand_color, slug: l.slug },
    };
  });

  app.post('/pay/:code/checkout', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { code } = parse(z.object({ code: z.string().max(20) }), req.params);
    const b = parse(z.object({ customerName: z.string().max(100).optional(), customerPhone: z.string().optional(), dropoff: zPlace.optional() }), req.body);
    const input = { ...b, customerPhone: b.customerPhone ? normalizeOmanPhone(b.customerPhone) : undefined };
    return tx((c) => startPaymentLinkCheckout(c, code, input));
  });

  // ── Merchant: payment links ──
  app.get('/merchants/:merchantId/payment-links', async (req) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.payment_links:manage');
    const rows = await q(pool, `SELECT * FROM payment_links WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 200`, [merchantId]);
    return { items: rows.map(paymentLinkDto) };
  });

  app.post('/merchants/:merchantId/payment-links', async (req, reply) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    const auth = requireMerchantPerm(req, merchantId, 'merchant.payment_links:manage');
    const b = parse(z.object({
      title: z.string().trim().min(2).max(120), description: z.string().max(500).optional(), amountBaisa: z.number().int().min(100).max(5_000_000),
      customerName: z.string().max(100).optional(), customerPhone: z.string().optional(), requestDelivery: z.boolean().optional(),
      expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
    }), req.body);
    const m = await one(pool, `SELECT status FROM merchants WHERE id = $1`, [merchantId]);
    if (m?.status !== 'active') throw conflict('Your store must be approved before creating payment links', 'merchant_unavailable');
    const row = await one(
      pool,
      `INSERT INTO payment_links (merchant_id, code, title, description, amount_baisa, customer_name, customer_phone, request_delivery, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(hours => $9::int), $10) RETURNING *`,
      [merchantId, shortCode(8), b.title, b.description ?? null, b.amountBaisa, b.customerName ?? null, b.customerPhone ? normalizeOmanPhone(b.customerPhone) : null,
        b.requestDelivery ?? false, b.expiresInHours ?? 72, auth.userId],
    );
    reply.code(201);
    return paymentLinkDto(row);
  });

  app.post('/merchants/:merchantId/payment-links/:id/cancel', async (req) => {
    const { merchantId, id } = parse(z.object({ merchantId: zUuid, id: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.payment_links:manage');
    const row = await one(pool, `UPDATE payment_links SET status = 'cancelled' WHERE id = $1 AND merchant_id = $2 AND status = 'active' RETURNING *`, [id, merchantId]);
    if (!row) throw conflict('Only active links can be cancelled', 'link_inactive');
    return paymentLinkDto(row);
  });
}
