import { one, q, type Queryable } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { latLngCols, rowPoint } from '../../lib/geo.js';
import { maskPhone } from '../../lib/phone.js';
import { ACTIVE_DELIVERY_STATUSES } from '../core/state.js';
import { invoiceAvailable, invoiceUrl } from './invoice.js';

export type Viewer = 'customer' | 'merchant' | 'captain' | 'ops';

export const DELIVERY_SELECT = `SELECT d.*, ${latLngCols('d.pickup_location', 'pu')}, ${latLngCols('d.dropoff_location', 'do')},
  c.vehicle_type AS c_vehicle_type, c.vehicle_plate AS c_plate, c.vehicle_color AS c_color, c.vehicle_model AS c_model, c.rating_avg AS c_rating,
  cu.full_name AS c_name, cu.phone AS c_phone, ${latLngCols('cl.location', 'cl')}, cl.heading AS cl_heading, cl.updated_at AS cl_updated_at
  FROM deliveries d LEFT JOIN captains c ON c.id = d.captain_id LEFT JOIN users cu ON cu.id = c.user_id
  LEFT JOIN captain_locations cl ON cl.captain_id = d.captain_id`;

const firstName = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'Captain';

export function captainPublicDto(d: any, viewer: Viewer) {
  if (!d.captain_id) return null;
  const active = ACTIVE_DELIVERY_STATUSES.includes(d.status);
  return {
    id: d.captain_id,
    firstName: firstName(d.c_name),
    vehicleType: d.c_vehicle_type,
    vehiclePlate: d.c_plate,
    vehicleColor: d.c_color,
    vehicleModel: d.c_model,
    ratingAvg: Number(d.c_rating),
    phone: active && viewer !== 'captain' ? d.c_phone : null,
    location: active && d.cl_lat != null ? { ...rowPoint(d, 'cl')!, heading: d.cl_heading != null ? Number(d.cl_heading) : null, updatedAt: d.cl_updated_at } : null,
  };
}

export function deliveryDto(d: any, viewer: Viewer) {
  const active = ACTIVE_DELIVERY_STATUSES.includes(d.status);
  const contactPhone = (p: string | null) => (viewer === 'captain' ? (active ? p : maskPhone(p)) : p);
  return {
    id: d.id,
    status: d.status,
    vehicleType: d.vehicle_type,
    pickup: { location: rowPoint(d, 'pu'), address: d.pickup_address, contactName: d.pickup_contact_name, contactPhone: contactPhone(d.pickup_contact_phone), notes: d.pickup_notes },
    dropoff: { location: rowPoint(d, 'do'), address: d.dropoff_address, contactName: d.dropoff_contact_name, contactPhone: contactPhone(d.dropoff_contact_phone), notes: d.dropoff_notes },
    packageSize: d.package_size,
    packageDescription: d.package_description,
    distanceM: d.distance_m,
    estimatedDurationS: d.estimated_duration_s,
    feeBaisa: d.fee_baisa,
    codAmountBaisa: d.cod_amount_baisa,
    deliveryPin: viewer === 'captain' ? null : d.delivery_pin,
    pinRequired: d.pin_required,
    captain: captainPublicDto(d, viewer),
    etaPickupAt: d.eta_pickup_at,
    etaDropoffAt: d.eta_dropoff_at,
    assignedAt: d.assigned_at,
    pickedUpAt: d.picked_up_at,
    deliveredAt: d.delivered_at,
    failureReason: d.failure_reason,
  };
}

export async function loadOrderRow(db: Queryable, id: string) {
  const o = await one(
    db,
    `SELECT o.*, m.slug AS m_slug, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.logo_url AS m_logo, m.contact_phone AS m_phone
       FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
    [id],
  );
  if (!o) throw notFound('Order');
  return o;
}

export async function orderDto(db: Queryable, o: any, viewer: Viewer, opts: { withTimeline?: boolean } = { withTimeline: true }) {
  const [items, delivery, timeline, rated] = await Promise.all([
    q(db, `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [o.id]),
    one(db, `${DELIVERY_SELECT} WHERE d.order_id = $1`, [o.id]),
    opts.withTimeline ? q(db, `SELECT to_status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`, [o.id]) : Promise.resolve([]),
    one(db, `SELECT 1 AS x FROM ratings WHERE order_id = $1 LIMIT 1`, [o.id]),
  ]);
  return {
    id: o.id,
    number: o.number,
    type: o.type,
    source: o.source,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    codPayer: o.cod_payer,
    merchant: o.merchant_id ? { id: o.merchant_id, slug: o.m_slug, nameEn: o.m_name_en, nameAr: o.m_name_ar, logoUrl: o.m_logo, contactPhone: viewer === 'captain' ? null : o.m_phone } : null,
    customerName: o.customer_name,
    customerPhone: viewer === 'captain' ? (delivery && ACTIVE_DELIVERY_STATUSES.includes(delivery.status) ? o.customer_phone : maskPhone(o.customer_phone)) : o.customer_phone,
    items: items.map((i) => ({ id: i.id, productId: i.product_id, nameEn: i.name_en, nameAr: i.name_ar, unitPriceBaisa: i.unit_price_baisa, quantity: i.quantity, options: i.options, lineTotalBaisa: i.line_total_baisa, notes: i.notes })),
    subtotalBaisa: o.subtotal_baisa,
    deliveryFeeBaisa: o.delivery_fee_baisa,
    serviceFeeBaisa: o.service_fee_baisa,
    discountBaisa: o.discount_baisa,
    vatBaisa: o.vat_baisa,
    totalBaisa: o.total_baisa,
    codAmountBaisa: o.cod_amount_baisa,
    ...(viewer === 'merchant' || viewer === 'ops' ? { commissionBaisa: o.commission_baisa } : {}),
    currency: o.currency,
    notes: o.notes,
    prepTimeMinutes: o.prep_time_minutes,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    placedAt: o.placed_at,
    acceptedAt: o.accepted_at,
    readyAt: o.ready_at,
    deliveredAt: o.delivered_at,
    cancelledAt: o.cancelled_at,
    delivery: delivery ? deliveryDto(delivery, viewer) : null,
    timeline: timeline.map((t) => ({ status: t.to_status, at: t.created_at, note: t.note })),
    rated: !!rated,
    invoiceUrl: viewer !== 'captain' && invoiceAvailable(o) ? invoiceUrl(o.id) : null,
  };
}

export async function loadOrder(db: Queryable, id: string, viewer: Viewer) {
  return orderDto(db, await loadOrderRow(db, id), viewer);
}

export function orderChannels(o: { id: string; merchant_id?: string | null }, deliveryId?: string | null) {
  return [`order:${o.id}`, ...(o.merchant_id ? [`merchant:${o.merchant_id}`] : []), ...(deliveryId ? [`delivery:${deliveryId}`] : []), 'admin:ops'];
}
