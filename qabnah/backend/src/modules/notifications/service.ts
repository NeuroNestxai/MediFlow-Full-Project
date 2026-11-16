import { one, q, type Queryable } from '../../db/pool.js';
import { sendPush } from '../../integrations/push.js';
import { sendWhatsAppTemplate, WA_TEMPLATES } from '../../integrations/whatsapp.js';
import { publish } from '../../realtime/bus.js';

type Tpl = { en: [string, string]; ar: [string, string] };
const T: Record<string, (d: any) => Tpl> = {
  'order.placed.merchant': (d) => ({ en: ['New order', `Order ${d.number} is waiting for you`], ar: ['طلب جديد', `الطلب ${d.number} بانتظارك`] }),
  'order.accepted': (d) => ({ en: ['Order accepted', `${d.merchant} is preparing order ${d.number}`], ar: ['تم قبول طلبك', `${d.merchant} يجهز طلبك ${d.number}`] }),
  'order.rejected': (d) => ({ en: ['Order not accepted', `Order ${d.number} could not be accepted`], ar: ['لم يتم قبول الطلب', `تعذر قبول الطلب ${d.number}`] }),
  'order.cancelled': (d) => ({ en: ['Order cancelled', `Order ${d.number} was cancelled`], ar: ['تم إلغاء الطلب', `تم إلغاء الطلب ${d.number}`] }),
  'delivery.assigned': (d) => ({ en: ['Captain assigned', `${d.captain} is on the way to pick up ${d.number}`], ar: ['تم تعيين كابتن', `${d.captain} في الطريق لاستلام ${d.number}`] }),
  'delivery.picked_up': (d) => ({ en: ['On the way', `Order ${d.number} has been picked up`], ar: ['في الطريق إليك', `تم استلام الطلب ${d.number}`] }),
  'delivery.delivered': (d) => ({ en: ['Delivered', `Order ${d.number} was delivered. Enjoy!`], ar: ['تم التوصيل', `تم توصيل الطلب ${d.number}`] }),
  'delivery.failed': (d) => ({ en: ['Delivery problem', `We could not deliver ${d.number}. Support will contact you.`], ar: ['مشكلة في التوصيل', `تعذر توصيل ${d.number}، سيتواصل معك الدعم`] }),
  'offer.created': (d) => ({ en: ['New delivery offer', `Earn ${d.earning} — accept within ${d.seconds}s`], ar: ['طلب توصيل جديد', `اربح ${d.earning} — اقبل خلال ${d.seconds} ثانية`] }),
  'captain.approved': () => ({ en: ['You are approved', 'You can now go online and receive offers'], ar: ['تم اعتمادك', 'يمكنك الآن الاتصال واستقبال الطلبات'] }),
  'captain.rejected': (d) => ({ en: ['Application update', d.reason ?? 'Your application needs changes'], ar: ['تحديث الطلب', d.reason ?? 'طلبك يحتاج إلى تعديلات'] }),
  'captain.document_rejected': (d) => ({ en: ['Document rejected', `${d.docType}: ${d.reason ?? ''}`], ar: ['تم رفض مستند', `${d.docType}: ${d.reason ?? ''}`] }),
  'merchant.approved': (d) => ({ en: ['Store approved', `${d.name} is live on Qabnah`], ar: ['تم اعتماد المتجر', `${d.name} متاح الآن على قبناه`] }),
  'merchant.rejected': (d) => ({ en: ['Store application', d.reason ?? 'Your application needs changes'], ar: ['طلب المتجر', d.reason ?? 'طلبك يحتاج إلى تعديلات'] }),
  'support.reply': (d) => ({ en: ['Support replied', `New reply on ticket ${d.number}`], ar: ['رد من الدعم', `رد جديد على التذكرة ${d.number}`] }),
  'payment_link.paid': (d) => ({ en: ['Payment received', `${d.title} was paid`], ar: ['تم استلام الدفع', `تم دفع ${d.title}`] }),
};

export async function notify(db: Queryable, userId: string, type: string, data: Record<string, unknown> = {}) {
  const tpl = T[type]?.(data);
  if (!tpl) throw new Error(`unknown notification type ${type}`);
  const u = await one(db, `SELECT locale FROM users WHERE id = $1`, [userId]);
  const [title, body] = tpl[(u?.locale as 'ar' | 'en') ?? 'ar'];
  const n = await one(db, `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`, [userId, type, title, body, JSON.stringify(data)]);
  await publish(db, [`user:${userId}`], 'notification.created', { id: n.id, type, title, body, data, createdAt: n.created_at });
  sendPush(userId, title, body, data).catch(() => {});
}

export async function notifyMany(db: Queryable, userIds: string[], type: string, data: Record<string, unknown> = {}) {
  for (const id of userIds) await notify(db, id, type, data);
}

/** Customer WhatsApp update for merchant orders, if the merchant enabled it for this event. Fire-and-forget. */
export async function merchantWhatsApp(db: Queryable, orderId: string, event: 'order.placed' | 'order.accepted' | 'delivery.picked_up' | 'delivery.delivered') {
  const o = await one(
    db,
    `SELECT o.number, o.customer_phone, m.id AS merchant_id, m.name_ar, m.whatsapp_enabled, m.whatsapp_notify_events
       FROM orders o JOIN merchants m ON m.id = o.merchant_id WHERE o.id = $1`,
    [orderId],
  );
  if (!o || !o.whatsapp_enabled || !o.customer_phone || !o.whatsapp_notify_events.includes(event)) return;
  sendWhatsAppTemplate({ to: o.customer_phone, template: WA_TEMPLATES[event], language: 'ar', params: [o.name_ar, o.number], merchantId: o.merchant_id }).catch(() => {});
}

export async function staffUserIdsWithPerm(db: Queryable, perm: string): Promise<string[]> {
  const rows = await q(db, `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.merchant_id IS NULL AND rp.permission_key = $1`, [perm]);
  return rows.map((r) => r.user_id);
}
