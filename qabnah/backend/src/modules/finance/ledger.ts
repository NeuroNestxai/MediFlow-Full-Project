import { one, q, type Queryable } from '../../db/pool.js';

type Account = { type: 'merchant' | 'captain' | 'platform'; id: string | null };
interface Entry { account: Account; entryType: string; amount: number; description: string }

async function post(db: Queryable, entries: Entry[], refs: { orderId?: string | null; deliveryId?: string | null; createdBy?: string | null }) {
  for (const e of entries) {
    if (!e.amount) continue;
    await q(
      db,
      `INSERT INTO ledger_entries (account_type, account_id, entry_type, amount_baisa, order_id, delivery_id, description, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.account.type, e.account.id, e.entryType, e.amount, refs.orderId ?? null, refs.deliveryId ?? null, e.description, refs.createdBy ?? null],
    );
  }
}

/**
 * Ledger postings when a delivery is completed. Sign convention: positive = platform owes the account.
 * See DATABASE_SCHEMA.md "Ledger postings". Pure computation is exported for unit tests.
 */
export function deliveryPostings(o: any, d: any): Entry[] {
  const M: Account = { type: 'merchant', id: o.merchant_id };
  const C: Account = { type: 'captain', id: d.captain_id };
  const P: Account = { type: 'platform', id: null };
  const n = o.number;
  const F = d.fee_baisa;
  const E = d.captain_earning_baisa;
  const out: Entry[] = [
    { account: C, entryType: 'captain_earning', amount: E, description: `Delivery ${n}` },
    { account: P, entryType: 'platform_delivery_revenue', amount: F - E, description: `Delivery margin ${n}` },
  ];
  if (o.type === 'marketplace') {
    const goods = o.total_baisa - o.delivery_fee_baisa - o.service_fee_baisa + o.discount_baisa;
    out.push(
      { account: M, entryType: 'order_sale', amount: goods, description: `Order ${n}` },
      { account: M, entryType: 'commission', amount: -o.commission_baisa, description: `Commission ${n}` },
      { account: P, entryType: 'platform_commission_revenue', amount: o.commission_baisa, description: `Commission ${n}` },
      { account: P, entryType: 'platform_service_fee', amount: o.service_fee_baisa, description: `Service fee ${n}` },
    );
    if (o.payment_method === 'cod') out.push({ account: C, entryType: 'cod_collected', amount: -o.total_baisa, description: `Cash collected ${n}` });
  } else if (o.type === 'merchant_delivery') {
    out.push({ account: M, entryType: 'delivery_fee_charge', amount: -F, description: `Delivery fee ${n}` });
    if (o.payment_method === 'cod' && d.cod_amount_baisa > 0) {
      out.push(
        { account: M, entryType: 'order_sale', amount: d.cod_amount_baisa, description: `Cash collected for you ${n}` },
        { account: C, entryType: 'cod_collected', amount: -d.cod_amount_baisa, description: `Cash collected ${n}` },
      );
    }
    if (o.payment_method === 'online') {
      out.push(
        { account: M, entryType: 'order_sale', amount: o.subtotal_baisa, description: `Payment link ${n}` },
        { account: M, entryType: 'commission', amount: -o.commission_baisa, description: `Commission ${n}` },
        { account: P, entryType: 'platform_commission_revenue', amount: o.commission_baisa, description: `Commission ${n}` },
      );
    }
  } else if (o.type === 'c2c' && o.payment_method === 'cod') {
    out.push({ account: C, entryType: 'cod_collected', amount: -F, description: `Cash collected ${n}` });
  }
  return out;
}

export async function postDeliveryCompleted(db: Queryable, orderId: string, deliveryId: string) {
  const exists = await one(db, `SELECT 1 FROM ledger_entries WHERE delivery_id = $1 AND entry_type = 'captain_earning'`, [deliveryId]);
  if (exists) return; // idempotent
  const o = await one(db, `SELECT * FROM orders WHERE id = $1`, [orderId]);
  const d = await one(db, `SELECT * FROM deliveries WHERE id = $1`, [deliveryId]);
  await post(db, deliveryPostings(o, d), { orderId, deliveryId });
}

export async function postPaymentLinkSale(db: Queryable, merchantId: string, amount: number, commission: number, code: string) {
  await post(db, [
    { account: { type: 'merchant', id: merchantId }, entryType: 'order_sale', amount, description: `Payment link ${code}` },
    { account: { type: 'merchant', id: merchantId }, entryType: 'commission', amount: -commission, description: `Commission ${code}` },
    { account: { type: 'platform', id: null }, entryType: 'platform_commission_revenue', amount: commission, description: `Commission ${code}` },
  ], {});
}

export async function postEntry(db: Queryable, account: Account, entryType: string, amount: number, description: string, createdBy: string | null, orderId?: string | null) {
  await post(db, [{ account, entryType, amount, description }], { createdBy, orderId });
}

export async function balance(db: Queryable, type: 'merchant' | 'captain', id: string, onlyUnsettled = false): Promise<number> {
  const r = await one(db, `SELECT COALESCE(SUM(amount_baisa),0)::bigint AS b FROM ledger_entries WHERE account_type = $1 AND account_id = $2 ${onlyUnsettled ? 'AND settlement_id IS NULL' : ''}`, [type, id]);
  return Number(r.b);
}

export const ledgerDto = (e: any) => ({
  id: Number(e.id), entryType: e.entry_type, amountBaisa: e.amount_baisa, orderId: e.order_id, orderNumber: e.order_number ?? null,
  description: e.description, settlementId: e.settlement_id, createdAt: e.created_at,
});
