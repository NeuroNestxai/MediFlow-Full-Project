import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, one, q, tx } from '../../db/pool.js';
import { sendWhatsAppTemplate, WA_TEMPLATES } from '../../integrations/whatsapp.js';
import { audit, invalidateAuthCache, requireMerchantPerm } from '../../lib/auth.js';
import { randomToken } from '../../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { normalizeOmanPhone } from '../../lib/phone.js';
import { parse, zLatLng, zPaging, zTime, zUuid } from '../../lib/validate.js';
import { bannerDto } from '../catalog/storefront.js';
import { zoneForPoint } from '../core/zones.js';
import { getMerchant, merchantDetailDto } from './service.js';

const mParams = z.object({ merchantId: zUuid });
const mIdParams = z.object({ merchantId: zUuid, id: zUuid });
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const phoneOpt = z.string().optional().transform((v) => (v ? normalizeOmanPhone(v) : undefined));

const merchantUpdate = z.object({
  nameEn: z.string().trim().min(2).max(80).optional(),
  nameAr: z.string().trim().min(2).max(80).optional(),
  legalName: z.string().max(160).optional(),
  crNumber: z.string().max(40).optional(),
  vatNumber: z.string().max(40).optional(),
  category: z.enum(['restaurant', 'cafe', 'grocery', 'pharmacy', 'retail', 'flowers', 'electronics', 'other']).optional(),
  contactPhone: phoneOpt,
  contactEmail: z.string().email().optional(),
  whatsappPhone: phoneOpt,
  whatsappEnabled: z.boolean().optional(),
  whatsappNotifyEvents: z.array(z.enum(['order.placed', 'order.accepted', 'delivery.picked_up', 'delivery.delivered'])).optional(),
  location: zLatLng.optional(),
  addressText: z.string().max(300).optional(),
  prepTimeMinutes: z.number().int().min(0).max(240).optional(),
  minOrderBaisa: z.number().int().min(0).max(1_000_000).optional(),
  acceptsCod: z.boolean().optional(),
  acceptsOnline: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  pricesIncludeVat: z.boolean().optional(),
  openingHours: z.array(z.object({ weekday: z.number().int().min(0).max(6), open: zTime, close: zTime })).max(21).optional(),
  logoUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(), // '' or null removes the image
  coverUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  brandColor: hex.optional(),
  accentColor: hex.optional(),
  taglineEn: z.string().max(140).optional(),
  taglineAr: z.string().max(140).optional(),
});

const COLS: Record<string, string> = {
  nameEn: 'name_en', nameAr: 'name_ar', legalName: 'legal_name', crNumber: 'cr_number', vatNumber: 'vat_number', category: 'category',
  contactPhone: 'contact_phone', contactEmail: 'contact_email', whatsappPhone: 'whatsapp_phone', whatsappEnabled: 'whatsapp_enabled',
  whatsappNotifyEvents: 'whatsapp_notify_events', addressText: 'address_text', prepTimeMinutes: 'prep_time_minutes', minOrderBaisa: 'min_order_baisa',
  acceptsCod: 'accepts_cod', acceptsOnline: 'accepts_online', isOpen: 'is_open', pricesIncludeVat: 'prices_include_vat', logoUrl: 'logo_url',
  coverUrl: 'cover_url', brandColor: 'brand_color', accentColor: 'accent_color', taglineEn: 'tagline_en', taglineAr: 'tagline_ar',
};

const bannerInput = z.object({
  imageUrl: z.string().url(),
  titleEn: z.string().max(120).optional(),
  titleAr: z.string().max(120).optional(),
  linkUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export default async function merchantRoutes(app: FastifyInstance) {
  app.get('/merchants/:merchantId', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    return merchantDetailDto(pool, await getMerchant(pool, merchantId));
  });

  app.patch('/merchants/:merchantId', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const b = parse(merchantUpdate, req.body);
    if (b.acceptsCod === false && b.acceptsOnline === false) throw badRequest('At least one payment method must be enabled');
    const sets: string[] = [];
    const params: unknown[] = [merchantId];
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined || !(k in COLS)) continue;
      params.push(v === '' && (k === 'logoUrl' || k === 'coverUrl') ? null : v);
      sets.push(`${COLS[k]} = $${params.length}`);
    }
    if (b.openingHours) { params.push(JSON.stringify(b.openingHours)); sets.push(`opening_hours = $${params.length}`); }
    if (b.location) {
      const zone = await zoneForPoint(pool, b.location);
      params.push(b.location.lng, b.location.lat, zone?.id ?? null);
      sets.push(`location = ST_SetSRID(ST_MakePoint($${params.length - 2},$${params.length - 1}),4326)::geography`, `zone_id = $${params.length}`);
    }
    if (sets.length) await q(pool, `UPDATE merchants SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
    await audit(pool, req, 'merchant.update', 'merchant', merchantId, b);
    return merchantDetailDto(pool, await getMerchant(pool, merchantId));
  });

  // Banners
  app.get('/merchants/:merchantId/banners', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    return { items: (await q(pool, `SELECT * FROM storefront_banners WHERE merchant_id = $1 ORDER BY sort_order`, [merchantId])).map(bannerDto) };
  });
  app.post('/merchants/:merchantId/banners', async (req, reply) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const b = parse(bannerInput, req.body);
    reply.code(201);
    return bannerDto(await one(pool, `INSERT INTO storefront_banners (merchant_id, image_url, title_en, title_ar, link_url, sort_order, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [
      merchantId, b.imageUrl, b.titleEn, b.titleAr, b.linkUrl, b.sortOrder ?? 0, b.isActive ?? true,
    ]));
  });
  app.patch('/merchants/:merchantId/banners/:id', async (req) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const b = parse(bannerInput.partial(), req.body);
    const row = await one(
      pool,
      `UPDATE storefront_banners SET image_url = COALESCE($3,image_url), title_en = COALESCE($4,title_en), title_ar = COALESCE($5,title_ar), link_url = COALESCE($6,link_url),
         sort_order = COALESCE($7,sort_order), is_active = COALESCE($8,is_active) WHERE id = $1 AND merchant_id = $2 RETURNING *`,
      [id, merchantId, b.imageUrl, b.titleEn, b.titleAr, b.linkUrl, b.sortOrder, b.isActive],
    );
    if (!row) throw notFound('Banner');
    return bannerDto(row);
  });
  app.delete('/merchants/:merchantId/banners/:id', async (req, reply) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const r = await q(pool, `DELETE FROM storefront_banners WHERE id = $1 AND merchant_id = $2 RETURNING id`, [id, merchantId]);
    if (!r.length) throw notFound('Banner');
    reply.code(204);
  });

  // Staff
  app.get('/merchants/:merchantId/staff', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    const rows = await q(
      pool,
      `SELECT u.id, u.full_name, u.email, array_agg(r.key ORDER BY r.key) AS roles FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id
        WHERE ur.merchant_id = $1 GROUP BY u.id ORDER BY u.full_name`,
      [merchantId],
    );
    return { items: rows.map((r) => ({ userId: r.id, fullName: r.full_name, email: r.email, roles: r.roles })) };
  });
  app.post('/merchants/:merchantId/staff', async (req, reply) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.staff:manage');
    const b = parse(z.object({ email: z.string().email(), fullName: z.string().trim().min(2), role: z.enum(['merchant_manager', 'merchant_staff']) }), req.body);
    const res = await tx(async (c) => {
      let user = await one(c, `SELECT * FROM users WHERE email = $1`, [b.email]);
      let temporaryPassword: string | null = null;
      if (!user) {
        temporaryPassword = randomToken(9);
        user = await one(c, `INSERT INTO users (email, full_name, password_hash) VALUES ($1,$2,$3) RETURNING *`, [b.email, b.fullName, await bcrypt.hash(temporaryPassword, 12)]);
      }
      const exists = await one(c, `SELECT 1 FROM user_roles WHERE user_id = $1 AND merchant_id = $2`, [user.id, merchantId]);
      if (exists) throw conflict('This person is already a staff member', 'already_member');
      await q(c, `INSERT INTO user_roles (user_id, role_id, merchant_id, created_by) SELECT $1, id, $2, $3 FROM roles WHERE key = $4`, [user.id, merchantId, req.auth!.userId, b.role]);
      await audit(c, req, 'merchant.staff_add', 'merchant', merchantId, { userId: user.id, role: b.role });
      return { member: { userId: user.id, fullName: user.full_name, email: user.email, roles: [b.role] }, temporaryPassword };
    });
    invalidateAuthCache();
    reply.code(201);
    return res;
  });
  app.delete('/merchants/:merchantId/staff/:userId', async (req, reply) => {
    const { merchantId, userId } = parse(z.object({ merchantId: zUuid, userId: zUuid }), req.params);
    const auth = requireMerchantPerm(req, merchantId, 'merchant.staff:manage');
    if (userId === auth.userId) throw forbidden('You cannot remove yourself');
    const owner = await one(pool, `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND ur.merchant_id = $2 AND r.key = 'merchant_owner'`, [userId, merchantId]);
    if (owner) throw forbidden('The store owner cannot be removed');
    await q(pool, `DELETE FROM user_roles WHERE user_id = $1 AND merchant_id = $2`, [userId, merchantId]);
    invalidateAuthCache(userId);
    await audit(pool, req, 'merchant.staff_remove', 'merchant', merchantId, { userId });
    reply.code(204);
  });

  // KYB documents
  app.get('/merchants/:merchantId/documents', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    const rows = await q(pool, `SELECT * FROM merchant_documents WHERE merchant_id = $1 ORDER BY created_at DESC`, [merchantId]);
    const { signFileUrl } = await import('../../integrations/storage.js');
    return { items: rows.map((d) => ({ ...merchantDocDto(d), fileUrl: signFileUrl(d.file_id) })) };
  });
  app.post('/merchants/:merchantId/documents', async (req, reply) => {
    const { merchantId } = parse(mParams, req.params);
    const auth = requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const b = parse(z.object({
      docType: z.enum(['commercial_registration', 'vat_certificate', 'municipality_license', 'owner_id', 'bank_letter', 'other']),
      fileId: zUuid, number: z.string().max(60).optional(), expiresAt: z.string().date().optional(),
    }), req.body);
    const f = await one(pool, `SELECT id FROM files WHERE id = $1 AND owner_user_id = $2 AND purpose = 'merchant_document'`, [b.fileId, auth.userId]);
    if (!f) throw badRequest('Upload the file with purpose merchant_document first');
    reply.code(201);
    return merchantDocDto(await one(pool, `INSERT INTO merchant_documents (merchant_id, doc_type, file_id, number, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [merchantId, b.docType, b.fileId, b.number, b.expiresAt]));
  });

  // WhatsApp
  app.get('/merchants/:merchantId/whatsapp/messages', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    const { limit, offset } = parse(zPaging, req.query);
    const [out, inbound] = await Promise.all([
      q(pool, `SELECT * FROM outbound_messages WHERE merchant_id = $1 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [merchantId, limit, offset]),
      q(pool, `SELECT * FROM inbound_messages WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`, [merchantId, limit]),
    ]);
    return {
      outbound: out.map((m) => ({ id: m.id, to: m.to_address, template: m.template, status: m.status, provider: m.provider, error: m.error, createdAt: m.created_at })),
      inbound: inbound.map((m) => ({ id: m.id, from: m.from_address, body: m.body, createdAt: m.created_at })),
    };
  });
  app.post('/merchants/:merchantId/whatsapp/test', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:manage');
    const b = parse(z.object({ phone: z.string() }), req.body);
    const { config } = await import('../../config.js');
    const r = await sendWhatsAppTemplate({ to: normalizeOmanPhone(b.phone), template: WA_TEMPLATES.test, language: 'en_US', merchantId });
    return { ...r, provider: config.WHATSAPP_PROVIDER, delivered: config.WHATSAPP_PROVIDER === 'cloud' && r.status === 'sent' };
  });
}

export const merchantDocDto = (d: any) => ({
  id: d.id, docType: d.doc_type, fileId: d.file_id, number: d.number, expiresAt: d.expires_at, status: d.status,
  rejectionReason: d.rejection_reason, reviewedAt: d.reviewed_at, createdAt: d.created_at,
});
