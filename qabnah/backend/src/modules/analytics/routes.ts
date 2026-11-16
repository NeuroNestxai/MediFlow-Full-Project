import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q } from '../../db/pool.js';
import { requireMerchantPerm, requirePerm } from '../../lib/auth.js';
import { parse, zUuid } from '../../lib/validate.js';
import { muscatNow } from '../core/time.js';

const zRange = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });

function range(f: { from?: string; to?: string }) {
  const to = f.to ?? muscatNow().date;
  const from = f.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  return { from, to, start: `${from}T00:00:00+04:00`, end: `${to}T23:59:59.999+04:00` };
}

/** KPIs over orders; `scope` is an extra SQL condition on alias o (with params starting at $3). */
export async function computeAnalytics(scope: string, scopeParams: unknown[], f: { from?: string; to?: string }) {
  const r = range(f);
  const p = [r.start, r.end, ...scopeParams];
  const base = `FROM orders o WHERE o.created_at BETWEEN $1 AND $2 ${scope}`;
  const done = `o.status IN ('delivered','completed')`;
  const [totals, byType, byDay, top, topMerchants, timing] = await Promise.all([
    one(pool, `SELECT count(*) FILTER (WHERE o.status <> 'pending_payment')::int AS orders, count(*) FILTER (WHERE ${done})::int AS completed,
        count(*) FILTER (WHERE o.status IN ('cancelled','rejected'))::int AS cancelled,
        COALESCE(SUM(o.total_baisa) FILTER (WHERE ${done}),0)::bigint AS gmv, COALESCE(SUM(o.delivery_fee_baisa) FILTER (WHERE ${done}),0)::bigint AS fees,
        COALESCE(SUM(o.commission_baisa) FILTER (WHERE ${done}),0)::bigint AS commission ${base}`, p),
    q(pool, `SELECT o.type, count(*)::int AS orders, COALESCE(SUM(o.total_baisa) FILTER (WHERE ${done}),0)::bigint AS gmv ${base} AND o.status <> 'pending_payment' GROUP BY 1 ORDER BY 1`, p),
    q(pool, `SELECT to_char(o.created_at AT TIME ZONE 'Asia/Muscat', 'YYYY-MM-DD') AS day, count(*)::int AS orders, COALESCE(SUM(o.total_baisa) FILTER (WHERE ${done}),0)::bigint AS gmv
        ${base} AND o.status <> 'pending_payment' GROUP BY 1 ORDER BY 1`, p),
    q(pool, `SELECT oi.name_en, oi.name_ar, SUM(oi.quantity)::int AS qty, SUM(oi.line_total_baisa)::bigint AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at BETWEEN $1 AND $2 ${scope} AND ${done} GROUP BY 1,2 ORDER BY qty DESC LIMIT 10`, p),
    q(pool, `SELECT m.id, m.name_en, m.name_ar, count(*)::int AS orders, COALESCE(SUM(o.total_baisa),0)::bigint AS gmv FROM orders o JOIN merchants m ON m.id = o.merchant_id
        WHERE o.created_at BETWEEN $1 AND $2 ${scope} AND ${done} GROUP BY m.id ORDER BY gmv DESC LIMIT 10`, p),
    one(pool, `SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - o.placed_at)) / 60) AS avg_delivery_min, AVG(EXTRACT(EPOCH FROM (d.assigned_at - d.created_at))) AS avg_assign_s
        FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE o.created_at BETWEEN $1 AND $2 ${scope} AND d.status = 'delivered'`, p),
  ]);
  const round1 = (x: any) => (x == null ? null : Math.round(Number(x) * 10) / 10);
  return {
    from: r.from, to: r.to,
    orders: totals.orders, completedOrders: totals.completed, cancelledOrders: totals.cancelled,
    gmvBaisa: Number(totals.gmv), averageOrderValueBaisa: totals.completed ? Math.round(Number(totals.gmv) / totals.completed) : 0,
    deliveryFeesBaisa: Number(totals.fees), commissionBaisa: Number(totals.commission),
    avgDeliveryMinutes: round1(timing?.avg_delivery_min), avgAssignSeconds: round1(timing?.avg_assign_s),
    byType: byType.map((t) => ({ type: t.type, orders: t.orders, gmvBaisa: Number(t.gmv) })),
    byDay: byDay.map((d) => ({ day: d.day, orders: d.orders, gmvBaisa: Number(d.gmv) })),
    topProducts: top.map((t) => ({ nameEn: t.name_en, nameAr: t.name_ar, quantity: t.qty, revenueBaisa: Number(t.revenue) })),
    topMerchants: topMerchants.map((m) => ({ id: m.id, nameEn: m.name_en, nameAr: m.name_ar, orders: m.orders, gmvBaisa: Number(m.gmv) })),
  };
}

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/admin/analytics/overview', async (req) => {
    requirePerm(req, 'analytics:read');
    const f = parse(zRange, req.query);
    const base = await computeAnalytics('', [], f);
    const r = range(f);
    const captains = await one(pool, `SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status IN ('pending_review','pending_documents'))::int AS pending,
        count(*) FILTER (WHERE is_online)::int AS online FROM captains`);
    const merchants = await one(pool, `SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'pending_review')::int AS pending FROM merchants`);
    const consumers = await one(pool, `SELECT count(DISTINCT customer_user_id)::int AS n FROM orders WHERE created_at BETWEEN $1 AND $2`, [r.start, r.end]);
    return { ...base, captains, merchants, activeCustomers: consumers.n };
  });

  app.get('/merchants/:merchantId/analytics', async (req) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.analytics:read');
    return computeAnalytics('AND o.merchant_id = $3', [merchantId], parse(zRange, req.query));
  });
}
