import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { parse, zPaging } from '../../lib/validate.js';
import { MERCHANT_SELECT, merchantSummaryDto } from '../merchants/service.js';
import { loadProducts } from './service.js';

export const bannerDto = (b: any) => ({ id: b.id, imageUrl: b.image_url, titleEn: b.title_en, titleAr: b.title_ar, linkUrl: b.link_url, sortOrder: b.sort_order, isActive: b.is_active });

export default async function storefrontRoutes(app: FastifyInstance) {
  app.get('/stores', async (req) => {
    const f = parse(
      zPaging.extend({
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        category: z.string().optional(),
        q: z.string().max(80).optional(),
      }),
      req.query,
    );
    const params: unknown[] = [];
    const where = [`m.status = 'active'`];
    let distance = 'NULL::float8';
    if (f.lat != null && f.lng != null) {
      params.push(f.lng, f.lat);
      distance = `ST_Distance(m.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)`;
      where.push(`ST_DWithin(m.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 30000)`);
    }
    if (f.category) { params.push(f.category); where.push(`m.category = $${params.length}`); }
    if (f.q) { params.push(`%${f.q}%`); where.push(`(m.name_en ILIKE $${params.length} OR m.name_ar ILIKE $${params.length})`); }
    const base = MERCHANT_SELECT.replace('SELECT m.*,', `SELECT m.*, ${distance} AS distance_m,`);
    const sqlWhere = where.join(' AND ');
    const [rows, total] = await Promise.all([
      q(pool, `${base} WHERE ${sqlWhere} ORDER BY m.is_open DESC, ${f.lat != null ? 'distance_m ASC' : 'm.rating_avg DESC'}, m.name_en LIMIT ${f.limit} OFFSET ${f.offset}`, params),
      one(pool, `SELECT count(*)::int AS n FROM merchants m WHERE ${sqlWhere}`, params),
    ]);
    return { items: rows.map(merchantSummaryDto), total: total.n, limit: f.limit, offset: f.offset };
  });

  app.get('/stores/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(60) }), req.params);
    const m = await one(pool, `${MERCHANT_SELECT} WHERE m.slug = $1 AND m.status = 'active'`, [slug]);
    if (!m) throw notFound('Store');
    const [banners, categories, products] = await Promise.all([
      q(pool, `SELECT * FROM storefront_banners WHERE merchant_id = $1 AND is_active ORDER BY sort_order`, [m.id]),
      q(pool, `SELECT * FROM categories WHERE merchant_id = $1 AND is_active ORDER BY sort_order, name_en`, [m.id]),
      loadProducts(pool, 'p.merchant_id = $1', [m.id]),
    ]);
    const catIds = new Set(categories.map((c) => c.id));
    return {
      merchant: { ...merchantSummaryDto(m), addressText: m.address_text, whatsappPhone: m.whatsapp_phone, openingHours: m.opening_hours },
      banners: banners.map(bannerDto),
      categories: categories.map((c) => ({
        id: c.id, nameEn: c.name_en, nameAr: c.name_ar, sortOrder: c.sort_order, isActive: c.is_active,
        products: products.filter((p) => p.categoryId === c.id),
      })),
      uncategorized: products.filter((p) => !p.categoryId || !catIds.has(p.categoryId)),
    };
  });
}
