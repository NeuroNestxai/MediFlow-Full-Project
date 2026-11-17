import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool, one, q, tx } from '../../db/pool.js';
import { invalidateAuthCache, requireAuth, requireCaptain } from '../../lib/auth.js';
import { badRequest, conflict, forbidden } from '../../lib/errors.js';
import { parse, zLatLng, zPaging, zTime, zUuid } from '../../lib/validate.js';
import { getSettings } from '../core/settings.js';
import { muscatNow } from '../core/time.js';
import { captainAction, captainDeliveryDto, completeDelivery, recordLocation } from '../deliveries/service.js';
import { acceptOffer, offerDto, rejectOffer } from '../dispatch/service.js';
import { balance, ledgerDto } from '../finance/ledger.js';
import { settlementDto } from '../finance/routes.js';
import { getCaptainProfile, requiredDocsFor } from './profile.js';

const profileInput = z.object({
  vehicleType: z.enum(['bike', 'car', 'van']),
  vehicleMake: z.string().max(40).optional(),
  vehicleModel: z.string().max(40).optional(),
  vehiclePlate: z.string().max(20).optional(),
  vehicleColor: z.string().max(30).optional(),
  nationalIdNumber: z.string().max(30).optional(),
  nationality: z.string().max(40).optional(),
  dateOfBirth: z.string().date().optional(),
  bankName: z.string().max(60).optional(),
  iban: z.string().regex(/^OM\d{2}[A-Z0-9]{3}\d{16}$/i, 'Omani IBAN format OMkk BBB AAAAAAAAAAAAAAAA').optional(),
  maxConcurrent: z.number().int().min(1).max(3).optional(),
});

/** Move a captain to pending_review once every required document has been uploaded. */
export async function refreshOnboardingStatus(db: any, captainId: string) {
  const c = await one(db, `SELECT * FROM captains WHERE id = $1`, [captainId]);
  if (c.status !== 'pending_documents') return;
  const settings = await getSettings(db);
  const docs = await q(db, `SELECT DISTINCT doc_type FROM captain_documents WHERE captain_id = $1 AND status <> 'rejected'`, [captainId]);
  const have = new Set(docs.map((d) => d.doc_type));
  if (requiredDocsFor(settings, c).every((d) => have.has(d))) await q(db, `UPDATE captains SET status = 'pending_review', updated_at = now() WHERE id = $1`, [captainId]);
}

export default async function captainRoutes(app: FastifyInstance) {
  app.post('/captain/register', async (req, reply) => {
    const auth = requireAuth(req);
    if (!auth.phone) throw forbidden('Sign in with your phone number to register as a captain');
    if (auth.captainId) throw conflict('You are already registered as a captain', 'already_registered');
    const b = parse(profileInput, req.body);
    const c = await tx(async (cx) => {
      const row = await one(
        cx,
        `INSERT INTO captains (user_id, vehicle_type, vehicle_make, vehicle_model, vehicle_plate, vehicle_color, national_id_number, nationality, date_of_birth, bank_name, iban, max_concurrent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [auth.userId, b.vehicleType, b.vehicleMake, b.vehicleModel, b.vehiclePlate, b.vehicleColor, b.nationalIdNumber, b.nationality, b.dateOfBirth, b.bankName, b.iban?.toUpperCase(), b.maxConcurrent ?? 1],
      );
      await q(cx, `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'captain' ON CONFLICT DO NOTHING`, [auth.userId]);
      return row;
    });
    invalidateAuthCache(auth.userId);
    reply.code(201);
    return getCaptainProfile(pool, c.id);
  });

  app.get('/captain/profile', async (req) => getCaptainProfile(pool, requireCaptain(req).captainId));

  app.patch('/captain/profile', async (req) => {
    const auth = requireCaptain(req);
    const b = parse(profileInput.partial(), req.body);
    const vehicleChanged = ['vehicleType', 'vehiclePlate', 'vehicleMake', 'vehicleModel'].some((k) => (b as any)[k] !== undefined);
    await q(
      pool,
      `UPDATE captains SET vehicle_type = COALESCE($2,vehicle_type), vehicle_make = COALESCE($3,vehicle_make), vehicle_model = COALESCE($4,vehicle_model),
         vehicle_plate = COALESCE($5,vehicle_plate), vehicle_color = COALESCE($6,vehicle_color), national_id_number = COALESCE($7,national_id_number),
         nationality = COALESCE($8,nationality), date_of_birth = COALESCE($9,date_of_birth), bank_name = COALESCE($10,bank_name), iban = COALESCE($11,iban),
         max_concurrent = COALESCE($12,max_concurrent),
         status = CASE WHEN $13 AND status = 'active' THEN 'pending_review' ELSE status END,
         is_online = CASE WHEN $13 AND status = 'active' THEN false ELSE is_online END, updated_at = now()
       WHERE id = $1`,
      [auth.captainId, b.vehicleType, b.vehicleMake, b.vehicleModel, b.vehiclePlate, b.vehicleColor, b.nationalIdNumber, b.nationality, b.dateOfBirth, b.bankName, b.iban?.toUpperCase(), b.maxConcurrent, vehicleChanged],
    );
    invalidateAuthCache(auth.userId);
    return getCaptainProfile(pool, auth.captainId);
  });

  app.post('/captain/documents', async (req, reply) => {
    const auth = requireCaptain(req);
    const b = parse(z.object({
      docType: z.enum(['national_id', 'driving_license', 'vehicle_registration', 'vehicle_insurance', 'profile_photo', 'police_clearance', 'professional_license', 'preventive_driving_license', 'naql_registration']),
      fileId: zUuid, number: z.string().max(40).optional(), expiresAt: z.string().date().optional(),
    }), req.body);
    if (b.expiresAt && b.expiresAt < muscatNow().date) throw badRequest('This document has already expired');
    const f = await one(pool, `SELECT 1 FROM files WHERE id = $1 AND owner_user_id = $2 AND purpose = 'captain_document'`, [b.fileId, auth.userId]);
    if (!f) throw badRequest('Upload the file with purpose captain_document first');
    const doc = await tx(async (c) => {
      const d = await one(c, `INSERT INTO captain_documents (captain_id, doc_type, file_id, number, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [auth.captainId, b.docType, b.fileId, b.number, b.expiresAt]);
      await refreshOnboardingStatus(c, auth.captainId);
      return d;
    });
    invalidateAuthCache(auth.userId);
    reply.code(201);
    const { documentDto } = await import('./profile.js');
    return documentDto(doc);
  });

  app.put('/captain/zones', async (req) => {
    const auth = requireCaptain(req);
    const b = parse(z.object({ zoneIds: z.array(zUuid).max(20) }), req.body);
    await tx(async (c) => {
      const valid = await q(c, `SELECT id FROM zones WHERE id = ANY($1) AND is_active`, [b.zoneIds]);
      if (valid.length !== new Set(b.zoneIds).size) throw badRequest('Unknown or inactive zone');
      await q(c, `DELETE FROM captain_zones WHERE captain_id = $1`, [auth.captainId]);
      for (const z of valid) await q(c, `INSERT INTO captain_zones (captain_id, zone_id) VALUES ($1,$2)`, [auth.captainId, z.id]);
    });
    return getCaptainProfile(pool, auth.captainId);
  });

  app.put('/captain/availability', async (req) => {
    const auth = requireCaptain(req);
    const b = parse(z.object({ slots: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: zTime, end: zTime })).max(42) }), req.body);
    for (const s of b.slots) if (s.end <= s.start) throw badRequest('Each slot must end after it starts');
    await tx(async (c) => {
      await q(c, `DELETE FROM captain_availability WHERE captain_id = $1`, [auth.captainId]);
      for (const s of b.slots) await q(c, `INSERT INTO captain_availability (captain_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)`, [auth.captainId, s.weekday, s.start, s.end]);
    });
    return getCaptainProfile(pool, auth.captainId);
  });

  app.post('/captain/status', async (req) => {
    const auth = requireCaptain(req);
    const b = parse(z.object({ online: z.boolean(), location: zLatLng.optional() }), req.body);
    if (b.online) {
      if (auth.captainStatus !== 'active') throw forbidden('Your account must be approved before going online');
      if (!b.location) throw badRequest('Location is required to go online');
      const expired = await one(pool, `SELECT doc_type FROM captain_documents WHERE captain_id = $1 AND status = 'approved' AND expires_at < current_date LIMIT 1`, [auth.captainId]);
      if (expired) throw forbidden(`Your ${expired.doc_type.replace(/_/g, ' ')} has expired. Upload a new one to go online.`);
      const zones = await one(pool, `SELECT count(*)::int AS n FROM captain_zones WHERE captain_id = $1`, [auth.captainId]);
      if (!zones.n) throw badRequest('Choose at least one service zone first');
      await recordLocation(pool, auth.captainId, b.location);
    }
    await q(pool, `UPDATE captains SET is_online = $2, updated_at = now() WHERE id = $1`, [auth.captainId, b.online]);
    if (!b.online) {
      const offers = await q(pool, `UPDATE delivery_offers SET status = 'rejected', reject_reason = 'went_offline', responded_at = now() WHERE captain_id = $1 AND status = 'pending' RETURNING delivery_id`, [auth.captainId]);
      if (offers.length) {
        const { runRound } = await import('../dispatch/service.js');
        for (const o of offers) await tx((c) => runRound(c, o.delivery_id));
      }
    }
    return getCaptainProfile(pool, auth.captainId);
  });

  app.post('/captain/location', { config: { rateLimit: { max: config.LOCATION_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = requireCaptain(req, { active: true });
    const b = parse(zLatLng.extend({ heading: z.number().min(0).max(360).optional(), speed: z.number().min(0).max(100).optional(), accuracy: z.number().min(0).max(10000).optional() }), req.body);
    await tx((c) => recordLocation(c, auth.captainId, b));
    reply.code(204);
  });

  app.get('/captain/offers', async (req) => {
    const auth = requireCaptain(req);
    const rows = await q(pool, `SELECT id FROM delivery_offers WHERE captain_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY offered_at`, [auth.captainId]);
    return { items: await Promise.all(rows.map((r) => offerDto(pool, r.id))) };
  });

  app.post('/captain/offers/:id/accept', async (req) => {
    const auth = requireCaptain(req, { active: true });
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const offer = await tx(async (c) => {
      const r = await acceptOffer(c, auth.captainId, id, auth.userId);
      if ('error' in r) return r;
      return one(c, `SELECT delivery_id FROM delivery_offers WHERE id = $1`, [id]);
    });
    if ('error' in offer) throw offer.error;
    return captainDeliveryDto(pool, offer.delivery_id);
  });

  app.post('/captain/offers/:id/reject', async (req, reply) => {
    const auth = requireCaptain(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ reason: z.string().max(200).optional() }), req.body);
    await tx((c) => rejectOffer(c, auth.captainId, id, b.reason));
    reply.code(204);
  });

  app.get('/captain/deliveries', async (req) => {
    const auth = requireCaptain(req);
    const f = parse(zPaging.extend({ status: z.enum(['active', 'history']).optional() }), req.query);
    const active = `d.status IN ('assigned','at_pickup','picked_up','at_dropoff')`;
    const where = `d.captain_id = $1 ${f.status === 'active' ? `AND ${active}` : f.status === 'history' ? `AND NOT ${active}` : ''}`;
    const rows = await q(pool, `SELECT d.id FROM deliveries d WHERE ${where} ORDER BY d.updated_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`, [auth.captainId]);
    const total = await one(pool, `SELECT count(*)::int AS n FROM deliveries d WHERE ${where}`, [auth.captainId]);
    return { items: await Promise.all(rows.map((r) => captainDeliveryDto(pool, r.id))), total: total.n };
  });

  app.get('/captain/deliveries/:id', async (req) => {
    const auth = requireCaptain(req);
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const d = await one(pool, `SELECT captain_id FROM deliveries WHERE id = $1`, [id]);
    if (!d || d.captain_id !== auth.captainId) throw forbidden();
    return captainDeliveryDto(pool, id);
  });

  app.post('/captain/deliveries/:id/status', async (req) => {
    const auth = requireCaptain(req, { active: true });
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({ action: z.enum(['arrive_pickup', 'pickup', 'arrive_dropoff', 'fail', 'release']), reason: z.string().max(300).optional(), location: zLatLng.optional() }), req.body);
    await tx((c) => captainAction(c, auth.captainId, auth.userId, id, b.action, b));
    const d = await one(pool, `SELECT captain_id FROM deliveries WHERE id = $1`, [id]);
    if (d.captain_id !== auth.captainId) return { id, status: 'released', nextActions: [] };
    return captainDeliveryDto(pool, id);
  });

  app.post('/captain/deliveries/:id/complete', async (req) => {
    const auth = requireCaptain(req, { active: true });
    const { id } = parse(z.object({ id: zUuid }), req.params);
    const b = parse(z.object({
      pin: z.string().regex(/^\d{4}$/).optional(), photoFileId: zUuid.optional(), recipientName: z.string().max(100).optional(),
      codCollectedBaisa: z.number().int().min(0).optional(), note: z.string().max(300).optional(), location: zLatLng.optional(),
    }), req.body);
    await tx((c) => completeDelivery(c, auth.captainId, auth.userId, id, b));
    return captainDeliveryDto(pool, id);
  });

  app.get('/captain/earnings', async (req) => {
    const auth = requireCaptain(req);
    const today = muscatNow().date;
    const f = parse(z.object({ from: z.string().date().optional(), to: z.string().date().optional() }), req.query);
    const from = f.from ?? today;
    const to = f.to ?? today;
    // Period boundaries in Muscat local time (UTC+4).
    const range = [`${from}T00:00:00+04:00`, `${to}T23:59:59.999+04:00`];
    const [entries, sums, deliveries] = await Promise.all([
      q(pool, `SELECT le.*, o.number AS order_number FROM ledger_entries le LEFT JOIN orders o ON o.id = le.order_id
                WHERE le.account_type = 'captain' AND le.account_id = $1 AND le.created_at BETWEEN $2 AND $3 ORDER BY le.created_at DESC LIMIT 500`, [auth.captainId, ...range]),
      one(pool, `SELECT COALESCE(SUM(amount_baisa) FILTER (WHERE entry_type IN ('captain_earning','tip')),0)::int AS earnings,
                        COALESCE(-SUM(amount_baisa) FILTER (WHERE entry_type = 'cod_collected'),0)::int AS cod
                   FROM ledger_entries WHERE account_type = 'captain' AND account_id = $1 AND created_at BETWEEN $2 AND $3`, [auth.captainId, ...range]),
      one(pool, `SELECT count(*)::int AS n FROM deliveries WHERE captain_id = $1 AND status = 'delivered' AND delivered_at BETWEEN $2 AND $3`, [auth.captainId, ...range]),
    ]);
    return {
      from, to, deliveriesCount: deliveries.n, earningsBaisa: sums.earnings, codCollectedBaisa: sums.cod,
      balanceBaisa: await balance(pool, 'captain', auth.captainId), entries: entries.map(ledgerDto),
    };
  });

  app.get('/captain/payouts', async (req) => {
    const auth = requireCaptain(req);
    const rows = await q(pool, `SELECT s.*, NULL AS account_name FROM settlements s WHERE account_type = 'captain' AND account_id = $1 AND status <> 'cancelled' ORDER BY period_end DESC`, [auth.captainId]);
    return { items: rows.map(settlementDto) };
  });
}
