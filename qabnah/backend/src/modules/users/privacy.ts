import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { storage } from '../../integrations/storage.js';
import { audit, invalidateAuthCache, requireAuth } from '../../lib/auth.js';
import { conflict } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { balance } from '../finance/ledger.js';
import { ACTIVE_DELIVERY_STATUSES, ACTIVE_ORDER_STATUSES } from '../core/state.js';

/**
 * Data-subject rights under Oman's PDPL (Royal Decree 6/2022): access/export and erasure.
 * Retention exceptions (tax, accounting, fraud) and the exact scope still need legal validation (DECISIONS checklist 8–12):
 * orders, payments and ledger rows are kept but stripped of personal data.
 */
export default async function privacyRoutes(app: FastifyInstance) {
  app.get('/me/export', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = requireAuth(req);
    const u = auth.userId;
    const [user, addresses, orders, tickets, notifications, devices, captain, roles] = await Promise.all([
      one(pool, `SELECT id, phone, email, full_name, locale, status, created_at, last_login_at, (totp_enabled_at IS NOT NULL) AS mfa_enabled FROM users WHERE id = $1`, [u]),
      q(pool, `SELECT id, label, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, area, street, building, floor, apartment, landmark, contact_name, contact_phone, created_at FROM addresses WHERE user_id = $1`, [u]),
      q(pool, `SELECT o.id, o.number, o.type, o.status, o.payment_method, o.payment_status, o.total_baisa, o.created_at, d.dropoff_address, d.pickup_address,
                (SELECT json_agg(json_build_object('name', i.name_en, 'quantity', i.quantity, 'lineTotalBaisa', i.line_total_baisa)) FROM order_items i WHERE i.order_id = o.id) AS items
               FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.customer_user_id = $1 ORDER BY o.created_at`, [u]),
      q(pool, `SELECT t.number, t.subject, t.status, t.created_at, (SELECT json_agg(json_build_object('body', m.body, 'at', m.created_at) ORDER BY m.created_at) FROM support_messages m
               WHERE m.ticket_id = t.id AND NOT m.is_internal) AS messages FROM support_tickets t WHERE t.requester_user_id = $1`, [u]),
      q(pool, `SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at`, [u]),
      q(pool, `SELECT platform, app, created_at FROM device_tokens WHERE user_id = $1`, [u]),
      one(pool, `SELECT id, status, nationality, vehicle_type, vehicle_make, vehicle_model, vehicle_plate, national_id_number, date_of_birth, bank_name, iban, created_at FROM captains WHERE user_id = $1`, [u]),
      q(pool, `SELECT r.key, ur.merchant_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [u]),
    ]);
    const captainData = captain
      ? {
          ...captain,
          documents: await q(pool, `SELECT doc_type, number, expires_at, status, created_at FROM captain_documents WHERE captain_id = $1`, [captain.id]),
          zones: (await q(pool, `SELECT z.code FROM captain_zones cz JOIN zones z ON z.id = cz.zone_id WHERE cz.captain_id = $1`, [captain.id])).map((z) => z.code),
          deliveries: await q(pool, `SELECT d.id, o.number, d.status, d.delivered_at, d.captain_earning_baisa FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.captain_id = $1 ORDER BY d.created_at`, [captain.id]),
          ledger: await q(pool, `SELECT entry_type, amount_baisa, description, created_at FROM ledger_entries WHERE account_type = 'captain' AND account_id = $1 ORDER BY id`, [captain.id]),
          locationHistoryRetentionDays: 90,
        }
      : null;
    await audit(pool, req, 'privacy.export', 'user', u);
    reply.header('content-disposition', `attachment; filename="qabnah-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
    return { exportedAt: new Date().toISOString(), user, roles, addresses, orders, supportTickets: tickets, notifications, devices, captain: captainData };
  });

  app.post('/me/delete', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = requireAuth(req);
    parse(z.object({ confirm: z.literal('DELETE') }), req.body);
    const u = auth.userId;
    const blockers: string[] = [];
    const active = await one(pool, `SELECT count(*)::int AS n FROM orders WHERE customer_user_id = $1 AND status = ANY($2)`, [u, ACTIVE_ORDER_STATUSES]);
    if (active.n) blockers.push('You have orders in progress');
    if (auth.merchantPerms.size) blockers.push('You are a member of a store; ask the store owner to remove you, or contact support to close the store');
    if (auth.roles.some((r) => !r.merchantId && !['consumer', 'captain'].includes(r.key))) blockers.push('Platform staff accounts are closed by an administrator');
    if (auth.captainId) {
      const d = await one(pool, `SELECT count(*)::int AS n FROM deliveries WHERE captain_id = $1 AND status = ANY($2)`, [auth.captainId, ACTIVE_DELIVERY_STATUSES]);
      if (d.n) blockers.push('You have deliveries in progress');
      if ((await balance(pool, 'captain', auth.captainId)) !== 0) blockers.push('Your earnings / cash balance must be settled first');
    }
    if (blockers.length) throw conflict(blockers.join('. '), 'account_deletion_blocked');

    const files = await tx(async (c) => {
      const docFiles = auth.captainId ? await q(c, `SELECT f.id, f.storage_key FROM captain_documents cd JOIN files f ON f.id = cd.file_id WHERE cd.captain_id = $1`, [auth.captainId]) : [];
      if (auth.captainId) {
        await q(c, `DELETE FROM captain_documents WHERE captain_id = $1`, [auth.captainId]);
        await q(c, `DELETE FROM captain_locations WHERE captain_id = $1`, [auth.captainId]);
        await q(c, `DELETE FROM delivery_tracks WHERE captain_id = $1`, [auth.captainId]);
        await q(c, `UPDATE captains SET status = 'suspended', is_online = false, national_id_number = NULL, date_of_birth = NULL, iban = NULL, bank_name = NULL,
                    vehicle_plate = NULL, rejection_reason = 'account deleted by user' WHERE id = $1`, [auth.captainId]);
      }
      await q(c, `DELETE FROM addresses WHERE user_id = $1`, [u]);
      await q(c, `DELETE FROM device_tokens WHERE user_id = $1`, [u]);
      await q(c, `DELETE FROM notifications WHERE user_id = $1`, [u]);
      await q(c, `DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [u]);
      await q(c, `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [u]);
      // Orders stay for tax/accounting, without personal data.
      await q(c, `UPDATE orders SET customer_name = 'Deleted user', customer_phone = NULL, notes = NULL WHERE customer_user_id = $1`, [u]);
      await q(c, `UPDATE deliveries d SET dropoff_contact_name = NULL, dropoff_contact_phone = NULL, dropoff_notes = NULL, pickup_contact_phone = CASE WHEN o.type = 'c2c' THEN NULL ELSE d.pickup_contact_phone END
                  FROM orders o WHERE o.id = d.order_id AND o.customer_user_id = $1`, [u]);
      await q(c, `UPDATE support_messages SET body = '[deleted]' WHERE author_user_id = $1`, [u]);
      await q(c, `UPDATE users SET status = 'deleted', deleted_at = now(), phone = NULL, email = $2, full_name = 'Deleted user', password_hash = NULL,
                  totp_secret_enc = NULL, totp_enabled_at = NULL WHERE id = $1`, [u, `deleted+${u}@deleted.qabnah.invalid`]);
      await q(c, `DELETE FROM files WHERE id = ANY($1)`, [docFiles.map((f) => f.id)]);
      await audit(c, req, 'privacy.account_deleted', 'user', u);
      return docFiles;
    });
    for (const f of files) await storage.remove(f.storage_key).catch(() => {});
    invalidateAuthCache(u);
    reply.code(204);
  });
}
