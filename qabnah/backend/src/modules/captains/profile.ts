import { one, q, type Queryable } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { signFileUrl } from '../../integrations/storage.js';
import { getSettings } from '../core/settings.js';

export function requiredDocsFor(settings: { requiredCaptainDocuments: string[] }, captain: { vehicle_type: string; employment_model: string }) {
  const docs = new Set(settings.requiredCaptainDocuments);
  if (captain.vehicle_type !== 'bike' || captain.employment_model === 'independent') docs.add('vehicle_insurance');
  return [...docs];
}

export const documentDto = (d: any) => ({
  id: d.id,
  docType: d.doc_type,
  fileId: d.file_id,
  fileUrl: signFileUrl(d.file_id),
  number: d.number,
  expiresAt: d.expires_at,
  status: d.status,
  rejectionReason: d.rejection_reason,
  createdAt: d.created_at,
});

export async function getCaptainProfile(db: Queryable, captainId: string) {
  const c = await one(
    db,
    `SELECT c.*, u.full_name, u.phone, fp.name AS fleet_partner_name FROM captains c JOIN users u ON u.id = c.user_id
       LEFT JOIN fleet_partners fp ON fp.id = c.fleet_partner_id WHERE c.id = $1`,
    [captainId],
  );
  if (!c) throw notFound('Captain');
  const [zones, slots, docs, settings] = await Promise.all([
    q(db, `SELECT zone_id FROM captain_zones WHERE captain_id = $1`, [captainId]),
    q(db, `SELECT weekday, to_char(start_time,'HH24:MI') AS start, to_char(end_time,'HH24:MI') AS "end" FROM captain_availability WHERE captain_id = $1 ORDER BY weekday, start_time`, [captainId]),
    q(db, `SELECT DISTINCT ON (doc_type) * FROM captain_documents WHERE captain_id = $1 ORDER BY doc_type, created_at DESC`, [captainId]),
    getSettings(db),
  ]);
  const required = requiredDocsFor(settings, c);
  const present = new Set(docs.filter((d) => d.status !== 'rejected').map((d) => d.doc_type));
  return {
    id: c.id,
    userId: c.user_id,
    fullName: c.full_name,
    phone: c.phone,
    status: c.status,
    rejectionReason: c.rejection_reason,
    employmentModel: c.employment_model,
    fleetPartner: c.fleet_partner_id ? { id: c.fleet_partner_id, name: c.fleet_partner_name } : null,
    vehicleType: c.vehicle_type,
    vehicleMake: c.vehicle_make,
    vehicleModel: c.vehicle_model,
    vehiclePlate: c.vehicle_plate,
    vehicleColor: c.vehicle_color,
    nationalIdNumber: c.national_id_number,
    nationality: c.nationality,
    dateOfBirth: c.date_of_birth,
    bankName: c.bank_name,
    iban: c.iban,
    isOnline: c.is_online,
    maxConcurrent: c.max_concurrent,
    ratingAvg: Number(c.rating_avg),
    ratingCount: c.rating_count,
    acceptanceRate: c.offers_received ? Math.round((c.offers_accepted / c.offers_received) * 100) / 100 : 1,
    zoneIds: zones.map((z) => z.zone_id),
    availability: slots,
    documents: docs.map(documentDto),
    requiredDocuments: required,
    missingDocuments: required.filter((d) => !present.has(d)),
  };
}
