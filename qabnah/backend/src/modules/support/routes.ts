import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { audit, hasPerm, requireAuth, requirePerm } from '../../lib/auth.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { parse, zPaging, zUuid } from '../../lib/validate.js';
import { notify } from '../notifications/service.js';

const ticketDto = (t: any, messages: any[] | null, viewerIsStaff: boolean) => ({
  id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority, status: t.status, orderId: t.order_id,
  requester: { id: t.requester_user_id, fullName: t.requester_name, role: t.requester_role }, assignedTo: t.assigned_to, assignedToName: t.assignee_name ?? null,
  messages: messages
    ?.filter((m) => viewerIsStaff || !m.is_internal)
    .map((m) => ({ id: m.id, body: m.body, isInternal: m.is_internal, author: { id: m.author_user_id, fullName: m.full_name, isStaff: m.author_user_id !== t.requester_user_id }, createdAt: m.created_at })),
  createdAt: t.created_at, updatedAt: t.updated_at,
});

const TICKET_SELECT = `SELECT t.*, u.full_name AS requester_name, a.full_name AS assignee_name FROM support_tickets t JOIN users u ON u.id = t.requester_user_id LEFT JOIN users a ON a.id = t.assigned_to`;

async function loadTicket(id: string, staff: boolean) {
  const t = await one(pool, `${TICKET_SELECT} WHERE t.id = $1`, [id]);
  if (!t) throw notFound('Ticket');
  const msgs = await q(pool, `SELECT m.*, u.full_name FROM support_messages m JOIN users u ON u.id = m.author_user_id WHERE m.ticket_id = $1 ORDER BY m.created_at`, [id]);
  return ticketDto(t, msgs, staff);
}

export default async function supportRoutes(app: FastifyInstance) {
  app.get('/support/tickets', async (req) => {
    const auth = requireAuth(req);
    const rows = await q(pool, `${TICKET_SELECT} WHERE t.requester_user_id = $1 ORDER BY t.updated_at DESC LIMIT 100`, [auth.userId]);
    return { items: rows.map((t) => ticketDto(t, null, false)) };
  });

  app.post('/support/tickets', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(z.object({
      subject: z.string().trim().min(3).max(150), category: z.enum(['order_issue', 'payment', 'delivery', 'captain', 'merchant', 'account', 'other']),
      orderId: zUuid.optional(), message: z.string().trim().min(2).max(4000),
    }), req.body);
    let merchantId: string | null = null;
    if (b.orderId) {
      const o = await one(pool, `SELECT o.customer_user_id, o.merchant_id, d.captain_id FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.id = $1`, [b.orderId]);
      const related = o && (o.customer_user_id === auth.userId || (o.captain_id && o.captain_id === auth.captainId) || (o.merchant_id && auth.merchantPerms.has(o.merchant_id)));
      if (!related) throw badRequest('Order not found');
      merchantId = o.merchant_id;
    }
    const role = auth.captainId ? 'captain' : auth.merchantPerms.size ? 'merchant' : 'consumer';
    const priority = b.category === 'payment' || b.category === 'delivery' ? 'high' : 'normal';
    const id = await tx(async (c) => {
      const t = await one(c, `INSERT INTO support_tickets (requester_user_id, requester_role, order_id, merchant_id, category, priority, subject) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [
        auth.userId, role, b.orderId ?? null, merchantId, b.category, priority, b.subject,
      ]);
      await q(c, `INSERT INTO support_messages (ticket_id, author_user_id, body) VALUES ($1,$2,$3)`, [t.id, auth.userId, b.message]);
      return t.id;
    });
    reply.code(201);
    return loadTicket(id, false);
  });

  app.get('/support/tickets/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const t = await one(pool, `SELECT requester_user_id FROM support_tickets WHERE id = $1`, [id]);
    if (!t) throw notFound('Ticket');
    const staff = hasPerm(auth, 'support:read');
    if (t.requester_user_id !== auth.userId && !staff) throw notFound('Ticket');
    return loadTicket(id, staff);
  });

  app.post('/support/tickets/:id/messages', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ body: z.string().trim().min(1).max(4000), isInternal: z.boolean().optional() }), req.body);
    const t = await one(pool, `SELECT * FROM support_tickets WHERE id = $1`, [id]);
    if (!t) throw notFound('Ticket');
    const isRequester = t.requester_user_id === auth.userId;
    const staff = hasPerm(auth, 'support:reply');
    if (!isRequester && !staff) throw notFound('Ticket');
    if (b.isInternal && !staff) throw forbidden('Only support staff can add internal notes');
    await tx(async (c) => {
      await q(c, `INSERT INTO support_messages (ticket_id, author_user_id, body, is_internal) VALUES ($1,$2,$3,$4)`, [id, auth.userId, b.body, !!b.isInternal]);
      const status = isRequester ? (t.status === 'resolved' ? 'open' : t.status) : b.isInternal ? t.status : 'pending';
      await q(c, `UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
      if (!isRequester && !b.isInternal) await notify(c, t.requester_user_id, 'support.reply', { number: t.number, ticketId: id });
    });
    reply.code(201);
    return loadTicket(id, staff);
  });

  app.get('/admin/support/tickets', async (req) => {
    requirePerm(req, 'support:read');
    const f = parse(zPaging.extend({ status: z.string().optional(), assignedTo: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.status) { params.push(f.status.split(',')); where.push(`t.status = ANY($${params.length})`); }
    if (f.assignedTo === 'unassigned') where.push('t.assigned_to IS NULL');
    else if (f.assignedTo) { params.push(f.assignedTo); where.push(`t.assigned_to = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(pool, `${TICKET_SELECT} ${w} ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = await one(pool, `SELECT count(*)::int AS n FROM support_tickets t ${w}`, params);
    return { items: rows.map((t) => ticketDto(t, null, true)), total: total.n };
  });

  app.patch('/admin/support/tickets/:id', async (req) => {
    const auth = requirePerm(req, 'support:reply');
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), assignedTo: zUuid.nullable().optional() }), req.body);
    if (b.assignedTo !== undefined && !auth.permissions.has('support:assign') && b.assignedTo !== auth.userId) throw forbidden('You can only assign tickets to yourself');
    const r = await q(pool, `UPDATE support_tickets SET status = COALESCE($2,status), priority = COALESCE($3,priority),
        assigned_to = CASE WHEN $4 THEN $5::uuid ELSE assigned_to END, updated_at = now() WHERE id = $1 RETURNING id`, [id, b.status, b.priority, b.assignedTo !== undefined, b.assignedTo ?? null]);
    if (!r.length) throw notFound('Ticket');
    await audit(pool, req, 'ticket.update', 'support_ticket', id, b);
    return loadTicket(id, true);
  });
}
