import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool, one, q } from '../../db/pool.js';
import { hmacHex, safeEqual } from '../../lib/crypto.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { parse, zUuid } from '../../lib/validate.js';
import { getSettings } from '../core/settings.js';

/**
 * Bilingual (Arabic first, English) receipt / simplified tax invoice per order.
 * The Consumer Protection Law reportedly requires an Arabic invoice (research §3.5). The exact tax-invoice format,
 * who issues it (merchant vs platform, agent vs principal) and Fawtara e-invoicing are NOT settled (DECISIONS D-020,
 * checklist 16–17) — the page says so explicitly and keeps both seller sections.
 */
const INVOICE_TTL_S = 30 * 60;

export function invoiceUrl(orderId: string, ttlS = INVOICE_TTL_S) {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  return `${config.PUBLIC_API_URL}/v1/invoices/${orderId}?exp=${exp}&sig=${hmacHex(config.FILE_SIGNING_SECRET, `invoice.${orderId}.${exp}`)}`;
}

export const invoiceAvailable = (o: { payment_status: string; status: string }) =>
  ['paid', 'refunded', 'partially_refunded'].includes(o.payment_status) || ['delivered', 'completed'].includes(o.status);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const omr = (b: number) => `${(b / 1000).toFixed(3)}`;
const muscat = (d: Date | string) => new Date(new Date(d).getTime() + 4 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);

export async function renderInvoice(orderId: string) {
  const o = await one(pool, `SELECT o.*, m.name_en AS m_en, m.name_ar AS m_ar, m.legal_name, m.cr_number, m.vat_number, m.address_text AS m_addr
    FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`, [orderId]);
  if (!o) throw notFound('Order');
  const items = await q(pool, `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]);
  const s = await getSettings(pool);
  const refunded = await one(pool, `SELECT COALESCE(SUM(refunded_baisa),0)::int AS r FROM payments WHERE order_id = $1`, [orderId]);
  const typeLabel: Record<string, string> = { marketplace: 'طلب متجر · Store order', merchant_delivery: 'توصيل للمتجر · Store delivery', c2c: 'إرسال طرد · Parcel' };
  const pay: Record<string, string> = { cod: 'الدفع عند الاستلام · Cash on delivery', online: 'دفع إلكتروني · Online', prepaid: 'مدفوع مسبقاً · Prepaid' };
  const lines = items.map((i) => `<tr><td><div>${esc(i.name_ar)}</div><div class="en">${esc(i.name_en)}${(i.options ?? []).length ? ' — ' + i.options.map((x: any) => esc(x.nameEn)).join(', ') : ''}</div></td>
      <td class="n">${i.quantity}</td><td class="n">${omr(i.unit_price_baisa)}</td><td class="n">${omr(i.line_total_baisa)}</td></tr>`).join('');
  const feeRows = [
    o.delivery_fee_baisa ? `<tr><td>رسوم التوصيل<div class="en">Delivery fee</div></td><td></td><td></td><td class="n">${omr(o.delivery_fee_baisa)}</td></tr>` : '',
    o.service_fee_baisa ? `<tr><td>رسوم الخدمة<div class="en">Service fee</div></td><td></td><td></td><td class="n">${omr(o.service_fee_baisa)}</td></tr>` : '',
    o.discount_baisa ? `<tr><td>خصم<div class="en">Discount</div></td><td></td><td></td><td class="n">-${omr(o.discount_baisa)}</td></tr>` : '',
  ].join('');
  const merchantSeller = o.merchant_id ? `<div class="party"><h3>البائع · Seller</h3><div><b>${esc(o.legal_name || o.m_en)}</b> — ${esc(o.m_ar)}</div>
      <div>السجل التجاري · CR: ${esc(o.cr_number || '—')}</div><div>الرقم الضريبي · VAT No.: ${esc(o.vat_number || '—')}</div><div>${esc(o.m_addr)}</div></div>` : '';
  const platform = `<div class="party"><h3>المنصة (رسوم التوصيل والخدمة) · Platform (delivery &amp; service fees)</h3><div><b>${esc(s.platformLegalName)}</b></div>
      <div>السجل التجاري · CR: ${esc(s.platformCrNumber || '—')}</div><div>الرقم الضريبي · VAT No.: ${esc(s.platformVatNumber || '—')}</div><div>${esc(s.platformAddress)}</div></div>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورة ${esc(o.number)} · Invoice</title>
<style>
body{font-family:'Noto Kufi Arabic',Tahoma,system-ui,sans-serif;background:#FBF7EF;color:#0B1F1C;margin:0;padding:16px}
main{max-width:760px;margin:auto;background:#fff;border:1px solid #E4E1D8;border-radius:16px;padding:24px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0E7C66;padding-bottom:12px;flex-wrap:wrap}
h1{font-size:20px;margin:0;color:#0E7C66} h3{font-size:13px;margin:0 0 4px;color:#5B6B68} .en{color:#5B6B68;font-size:12px;direction:ltr;text-align:right}
.meta div{font-size:13px} .parties{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:16px 0}
.party{border:1px solid #E4E1D8;border-radius:12px;padding:10px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px} th,td{padding:8px 6px;border-bottom:1px solid #EEE;text-align:start;vertical-align:top}
th{background:#E3F3EF;font-size:12px} .n{text-align:end;white-space:nowrap;direction:ltr}
.tot td{font-weight:700;font-size:15px;border-top:2px solid #0B1F1C} .note{margin-top:16px;font-size:11px;color:#5B6B68;background:#FFF7E6;border-radius:8px;padding:8px}
@media print{body{background:#fff;padding:0} main{border:0}}
</style></head><body><main>
<header><div><h1>فاتورة ضريبية مبسطة<br><span class="en" style="font-size:14px">Simplified tax invoice / receipt</span></h1></div>
<div class="meta"><div>رقم الفاتورة · No.: <b>${esc(o.number)}</b></div><div>التاريخ · Date: ${muscat(o.placed_at ?? o.created_at)} (GST+4)</div>
<div>${typeLabel[o.type] ?? esc(o.type)}</div><div>${pay[o.payment_method] ?? ''} — ${esc(o.payment_status)}</div></div></header>
<div class="parties">${merchantSeller}${platform}<div class="party"><h3>العميل · Customer</h3><div>${esc(o.customer_name || '—')}</div></div></div>
<table><thead><tr><th>البند · Item</th><th class="n">الكمية<br>Qty</th><th class="n">سعر الوحدة<br>Unit (OMR)</th><th class="n">المجموع<br>Total (OMR)</th></tr></thead>
<tbody>${lines}${feeRows}
<tr><td>ضريبة القيمة المضافة (${(s.vatRateBps / 100).toFixed(0)}%) — مشمولة<div class="en">VAT included</div></td><td></td><td></td><td class="n">${omr(o.vat_baisa)}</td></tr>
<tr class="tot"><td>الإجمالي (ر.ع.)<div class="en">Total (OMR)</div></td><td></td><td></td><td class="n">${omr(o.total_baisa)}</td></tr>
${refunded.r ? `<tr><td>مسترد<div class="en">Refunded</div></td><td></td><td></td><td class="n">-${omr(refunded.r)}</td></tr>` : ''}
</tbody></table>
<div class="note">هذا المستند صادر إلكترونياً من منصة قبناه. صيغة الفاتورة الضريبية ومُصدرها ومتطلبات الفوترة الإلكترونية (فوترة) قيد المراجعة القانونية والضريبية.<br>
<span class="en">Issued electronically by Qabnah. The tax-invoice format, issuing party and Fawtara e-invoicing requirements are pending legal/tax validation.</span></div>
</main></body></html>`;
}

export default async function invoiceRoutes(app: FastifyInstance) {
  app.get('/invoices/:orderId', async (req, reply) => {
    const { orderId } = parse(z.object({ orderId: zUuid }), req.params);
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    if (!exp || !sig || Number(exp) < Date.now() / 1000 || !safeEqual(hmacHex(config.FILE_SIGNING_SECRET, `invoice.${orderId}.${exp}`), sig)) throw forbidden('This invoice link has expired');
    const o = await one(pool, `SELECT payment_status, status FROM orders WHERE id = $1`, [orderId]);
    if (!o || !invoiceAvailable(o)) throw notFound('Invoice');
    reply.type('text/html').header('cache-control', 'private, no-store');
    return renderInvoice(orderId);
  });
}
