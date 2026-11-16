import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { audit, requireMerchantPerm, requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { parse, zPaging, zUuid } from '../../lib/validate.js';
import { balance, ledgerDto, postEntry } from './ledger.js';

export const settlementDto = (s: any) => ({
  id: s.id, accountType: s.account_type, accountId: s.account_id, accountName: s.account_name ?? null, periodStart: s.period_start, periodEnd: s.period_end,
  creditsBaisa: s.credits_baisa, debitsBaisa: s.debits_baisa, netBaisa: s.net_baisa, entryCount: s.entry_count, status: s.status,
  payoutReference: s.payout_reference, createdBy: s.created_by, approvedBy: s.approved_by, createdAt: s.created_at, approvedAt: s.approved_at, paidAt: s.paid_at,
});

const ACCOUNT_NAME = `CASE s.account_type WHEN 'merchant' THEN (SELECT name_en FROM merchants WHERE id = s.account_id)
  ELSE (SELECT u.full_name FROM captains c JOIN users u ON u.id = c.user_id WHERE c.id = s.account_id) END AS account_name`;

export async function generateSettlements(db: any, accountType: 'merchant' | 'captain', periodStart: string, periodEnd: string, createdBy: string) {
  const until = `${periodEnd}T23:59:59.999+04:00`;
  const accounts = await q(
    db,
    `SELECT account_id, COALESCE(SUM(amount_baisa) FILTER (WHERE amount_baisa > 0),0)::int AS credits,
            -COALESCE(SUM(amount_baisa) FILTER (WHERE amount_baisa < 0),0)::int AS debits, count(*)::int AS n
       FROM ledger_entries WHERE account_type = $1 AND settlement_id IS NULL AND created_at <= $2 GROUP BY account_id`,
    [accountType, until],
  );
  const created = [];
  for (const a of accounts) {
    const s = await one(
      db,
      `INSERT INTO settlements (account_type, account_id, period_start, period_end, credits_baisa, debits_baisa, net_baisa, entry_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [accountType, a.account_id, periodStart, periodEnd, a.credits, a.debits, a.credits - a.debits, a.n, createdBy],
    );
    await q(db, `UPDATE ledger_entries SET settlement_id = $1 WHERE account_type = $2 AND account_id = $3 AND settlement_id IS NULL AND created_at <= $4`, [s.id, accountType, a.account_id, until]);
    created.push(s);
  }
  return created;
}

export default async function financeRoutes(app: FastifyInstance) {
  app.get('/merchants/:merchantId/finance', async (req) => {
    const { merchantId } = parse(z.object({ merchantId: zUuid }), req.params);
    requireMerchantPerm(req, merchantId, 'merchant.finance:read');
    const [entries, settlements] = await Promise.all([
      q(pool, `SELECT le.*, o.number AS order_number FROM ledger_entries le LEFT JOIN orders o ON o.id = le.order_id
                WHERE le.account_type = 'merchant' AND le.account_id = $1 AND le.settlement_id IS NULL ORDER BY le.created_at DESC LIMIT 500`, [merchantId]),
      q(pool, `SELECT s.* FROM settlements s WHERE account_type = 'merchant' AND account_id = $1 ORDER BY period_end DESC LIMIT 50`, [merchantId]),
    ]);
    return {
      balanceBaisa: await balance(pool, 'merchant', merchantId),
      unsettledBaisa: await balance(pool, 'merchant', merchantId, true),
      unsettledEntries: entries.map(ledgerDto),
      settlements: settlements.map(settlementDto),
    };
  });

  app.get('/admin/finance/balances', async (req) => {
    requirePerm(req, 'finance:read');
    const f = parse(z.object({ accountType: z.enum(['merchant', 'captain']).optional() }), req.query);
    const rows = await q(
      pool,
      `SELECT le.account_type, le.account_id, SUM(le.amount_baisa)::int AS balance,
              COALESCE(SUM(le.amount_baisa) FILTER (WHERE le.settlement_id IS NULL),0)::int AS unsettled,
              COALESCE(SUM(-le.amount_baisa) FILTER (WHERE le.entry_type IN ('cod_collected','cod_remitted')),0)::int AS cash_held,
              CASE le.account_type WHEN 'merchant' THEN (SELECT name_en FROM merchants WHERE id = le.account_id)
                ELSE (SELECT u.full_name FROM captains c JOIN users u ON u.id = c.user_id WHERE c.id = le.account_id) END AS name
         FROM ledger_entries le WHERE le.account_type <> 'platform' ${f.accountType ? 'AND le.account_type = $1' : ''}
        GROUP BY 1,2 ORDER BY 1, 3 DESC`,
      f.accountType ? [f.accountType] : [],
    );
    const platform = await q(pool, `SELECT entry_type, SUM(amount_baisa)::int AS total FROM ledger_entries WHERE account_type = 'platform' GROUP BY 1 ORDER BY 1`);
    return {
      accounts: rows.map((r) => ({
        accountType: r.account_type, accountId: r.account_id, name: r.name, balanceBaisa: r.balance, unsettledBaisa: r.unsettled,
        cashHeldBaisa: r.account_type === 'captain' ? r.cash_held : null,
      })),
      platformRevenue: platform.map((p) => ({ entryType: p.entry_type, totalBaisa: p.total })),
    };
  });

  app.get('/admin/settlements', async (req) => {
    requirePerm(req, 'finance:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), accountType: z.enum(['merchant', 'captain']).optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.status) { params.push(f.status); where.push(`s.status = $${params.length}`); }
    if (f.accountType) { params.push(f.accountType); where.push(`s.account_type = $${params.length}`); }
    const rows = await q(pool, `SELECT s.*, ${ACCOUNT_NAME} FROM settlements s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    return { items: rows.map(settlementDto) };
  });

  app.post('/admin/settlements/generate', async (req, reply) => {
    const auth = requirePerm(req, 'settlements:manage');
    const b = parse(z.object({ accountType: z.enum(['merchant', 'captain']), periodStart: z.string().date(), periodEnd: z.string().date() }), req.body);
    if (b.periodEnd < b.periodStart) throw badRequest('periodEnd must be on or after periodStart');
    const created = await tx(async (c) => {
      const s = await generateSettlements(c, b.accountType, b.periodStart, b.periodEnd, auth.userId);
      await audit(c, req, 'settlements.generate', 'settlement', null, { ...b, count: s.length });
      return s;
    });
    reply.code(201);
    return { items: created.map(settlementDto) };
  });

  app.post('/admin/settlements/:id/:action', async (req) => {
    const { id, action } = parse(z.object({ id: zUuid, action: z.enum(['approve', 'mark-paid', 'cancel']) }), req.params);
    const b = parse(z.object({ payoutReference: z.string().trim().min(3).max(100).optional() }), req.body);
    return tx(async (c) => {
      const s = await one(c, `SELECT * FROM settlements WHERE id = $1 FOR UPDATE`, [id]);
      if (!s) throw notFound('Settlement');
      let updated;
      if (action === 'approve') {
        const auth = requirePerm(req, 'settlements:approve');
        if (s.status !== 'draft') throw conflict('Only draft settlements can be approved', 'invalid_transition');
        if (s.created_by === auth.userId) throw forbidden('A settlement must be approved by someone other than its creator');
        updated = await one(c, `UPDATE settlements SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1 RETURNING *`, [id, auth.userId]);
      } else if (action === 'mark-paid') {
        const auth = requirePerm(req, 'settlements:manage');
        if (s.status !== 'approved') throw conflict('Only approved settlements can be marked paid', 'invalid_transition');
        if (!b.payoutReference) throw badRequest('payoutReference (bank transfer reference) is required');
        updated = await one(c, `UPDATE settlements SET status = 'paid', paid_at = now(), payout_reference = $2 WHERE id = $1 RETURNING *`, [id, b.payoutReference]);
        if (s.net_baisa !== 0) {
          await q(
            c,
            `INSERT INTO ledger_entries (account_type, account_id, entry_type, amount_baisa, settlement_id, description, created_by) VALUES ($1,$2,'payout',$3,$4,$5,$6)`,
            [s.account_type, s.account_id, -s.net_baisa, id, `${s.net_baisa > 0 ? 'Payout' : 'Collection'} ${b.payoutReference}`, auth.userId],
          );
        }
      } else {
        requirePerm(req, 'settlements:manage');
        if (!['draft', 'approved'].includes(s.status)) throw conflict('Paid settlements cannot be cancelled', 'invalid_transition');
        await q(c, `UPDATE ledger_entries SET settlement_id = NULL WHERE settlement_id = $1`, [id]);
        updated = await one(c, `UPDATE settlements SET status = 'cancelled' WHERE id = $1 RETURNING *`, [id]);
      }
      await audit(c, req, `settlement.${action}`, 'settlement', id, b);
      return settlementDto(updated);
    });
  });

  app.post('/admin/captains/:id/cod-remittance', async (req) => {
    const auth = requirePerm(req, 'settlements:manage');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ amountBaisa: z.number().int().min(1).max(10_000_000), note: z.string().max(200).optional() }), req.body);
    const c = await one(pool, `SELECT id FROM captains WHERE id = $1`, [id]);
    if (!c) throw notFound('Captain');
    await tx(async (cx) => {
      await postEntry(cx, { type: 'captain', id }, 'cod_remitted', b.amountBaisa, b.note ?? 'Cash remitted', auth.userId);
      await audit(cx, req, 'captain.cod_remittance', 'captain', id, b);
    });
    return { balanceBaisa: await balance(pool, 'captain', id) };
  });
}
