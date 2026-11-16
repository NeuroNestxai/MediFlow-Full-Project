import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, one, q, tx, type Queryable } from '../../db/pool.js';
import { requireMerchantPerm } from '../../lib/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parse, zUuid } from '../../lib/validate.js';
import { loadProducts } from './service.js';

const mParams = z.object({ merchantId: zUuid });
const mIdParams = z.object({ merchantId: zUuid, id: zUuid });

const categoryInput = z.object({ nameEn: z.string().trim().min(1).max(80), nameAr: z.string().trim().min(1).max(80), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() });
const categoryDto = (c: any) => ({ id: c.id, nameEn: c.name_en, nameAr: c.name_ar, sortOrder: c.sort_order, isActive: c.is_active });

const optionInput = z.object({ nameEn: z.string().trim().min(1), nameAr: z.string().trim().min(1), priceDeltaBaisa: z.number().int().min(-1_000_000).max(1_000_000).default(0), isAvailable: z.boolean().default(true) });
const groupInput = z
  .object({
    kind: z.enum(['variant', 'addon']),
    nameEn: z.string().trim().min(1),
    nameAr: z.string().trim().min(1),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(1).optional(),
    options: z.array(optionInput).min(1).max(50),
  })
  .transform((g) => {
    const minSelect = g.minSelect ?? (g.kind === 'variant' ? 1 : 0);
    const maxSelect = g.maxSelect ?? (g.kind === 'variant' ? 1 : g.options.length);
    return { ...g, minSelect, maxSelect };
  })
  .refine((g) => g.maxSelect >= g.minSelect && g.minSelect <= g.options.length, { message: 'Invalid min/max selection for option group' });

const productInput = z.object({
  categoryId: zUuid.nullable().optional(),
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  descriptionEn: z.string().max(1000).optional(),
  descriptionAr: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  sku: z.string().max(60).optional(),
  basePriceBaisa: z.number().int().min(0).max(10_000_000),
  compareAtPriceBaisa: z.number().int().min(0).nullable().optional(),
  isAvailable: z.boolean().optional(),
  trackStock: z.boolean().optional(),
  stockQty: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
  optionGroups: z.array(groupInput).max(20).optional(),
});

async function writeGroups(c: Queryable, productId: string, groups: z.infer<typeof groupInput>[]) {
  await q(c, `DELETE FROM product_option_groups WHERE product_id = $1`, [productId]);
  for (const [gi, g] of groups.entries()) {
    const row = await one(c, `INSERT INTO product_option_groups (product_id, kind, name_en, name_ar, min_select, max_select, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [
      productId, g.kind, g.nameEn, g.nameAr, g.minSelect, g.maxSelect, gi,
    ]);
    for (const [oi, o] of g.options.entries())
      await q(c, `INSERT INTO product_options (group_id, name_en, name_ar, price_delta_baisa, is_available, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`, [row.id, o.nameEn, o.nameAr, o.priceDeltaBaisa, o.isAvailable, oi]);
  }
}

async function assertCategory(c: Queryable, merchantId: string, categoryId: string | null | undefined) {
  if (categoryId && !(await one(c, `SELECT 1 FROM categories WHERE id = $1 AND merchant_id = $2`, [categoryId, merchantId]))) throw badRequest('Category does not belong to this store');
}

async function getProduct(merchantId: string, id: string) {
  const [p] = await loadProducts(pool, 'p.id = $1 AND p.merchant_id = $2', [id, merchantId]);
  if (!p) throw notFound('Product');
  return p;
}

export default async function catalogRoutes(app: FastifyInstance) {
  app.get('/merchants/:merchantId/categories', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    return { items: (await q(pool, `SELECT * FROM categories WHERE merchant_id = $1 ORDER BY sort_order, name_en`, [merchantId])).map(categoryDto) };
  });
  app.post('/merchants/:merchantId/categories', async (req, reply) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const b = parse(categoryInput, req.body);
    reply.code(201);
    return categoryDto(await one(pool, `INSERT INTO categories (merchant_id, name_en, name_ar, sort_order, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [merchantId, b.nameEn, b.nameAr, b.sortOrder ?? 0, b.isActive ?? true]));
  });
  app.patch('/merchants/:merchantId/categories/:id', async (req) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const b = parse(categoryInput.partial(), req.body);
    const row = await one(pool, `UPDATE categories SET name_en = COALESCE($3,name_en), name_ar = COALESCE($4,name_ar), sort_order = COALESCE($5,sort_order), is_active = COALESCE($6,is_active) WHERE id = $1 AND merchant_id = $2 RETURNING *`, [
      id, merchantId, b.nameEn, b.nameAr, b.sortOrder, b.isActive,
    ]);
    if (!row) throw notFound('Category');
    return categoryDto(row);
  });
  app.delete('/merchants/:merchantId/categories/:id', async (req, reply) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const r = await q(pool, `DELETE FROM categories WHERE id = $1 AND merchant_id = $2 RETURNING id`, [id, merchantId]);
    if (!r.length) throw notFound('Category');
    reply.code(204);
  });

  app.get('/merchants/:merchantId/products', async (req) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    const f = parse(z.object({ categoryId: zUuid.optional(), q: z.string().optional() }), req.query);
    const params: unknown[] = [merchantId];
    let where = 'p.merchant_id = $1';
    if (f.categoryId) { params.push(f.categoryId); where += ` AND p.category_id = $${params.length}`; }
    if (f.q) { params.push(`%${f.q}%`); where += ` AND (p.name_en ILIKE $${params.length} OR p.name_ar ILIKE $${params.length} OR p.sku ILIKE $${params.length})`; }
    return { items: await loadProducts(pool, where, params) };
  });
  app.get('/merchants/:merchantId/products/:id', async (req) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.store:read');
    return getProduct(merchantId, id);
  });
  app.post('/merchants/:merchantId/products', async (req, reply) => {
    const { merchantId } = parse(mParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const b = parse(productInput, req.body);
    const id = await tx(async (c) => {
      await assertCategory(c, merchantId, b.categoryId);
      const row = await one(
        c,
        `INSERT INTO products (merchant_id, category_id, name_en, name_ar, description_en, description_ar, image_url, sku, base_price_baisa, compare_at_price_baisa, is_available, track_stock, stock_qty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [merchantId, b.categoryId ?? null, b.nameEn, b.nameAr, b.descriptionEn, b.descriptionAr, b.imageUrl, b.sku, b.basePriceBaisa, b.compareAtPriceBaisa ?? null, b.isAvailable ?? true, b.trackStock ?? false, b.stockQty ?? 0, b.sortOrder ?? 0],
      );
      await writeGroups(c, row.id, b.optionGroups ?? []);
      return row.id;
    });
    reply.code(201);
    return getProduct(merchantId, id);
  });
  app.put('/merchants/:merchantId/products/:id', async (req) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const b = parse(productInput, req.body);
    await tx(async (c) => {
      await assertCategory(c, merchantId, b.categoryId);
      const r = await q(
        c,
        `UPDATE products SET category_id=$3, name_en=$4, name_ar=$5, description_en=$6, description_ar=$7, image_url=$8, sku=$9, base_price_baisa=$10,
           compare_at_price_baisa=$11, is_available=$12, track_stock=$13, stock_qty=$14, sort_order=$15, updated_at=now()
         WHERE id = $1 AND merchant_id = $2 RETURNING id`,
        [id, merchantId, b.categoryId ?? null, b.nameEn, b.nameAr, b.descriptionEn ?? null, b.descriptionAr ?? null, b.imageUrl ?? null, b.sku ?? null, b.basePriceBaisa, b.compareAtPriceBaisa ?? null, b.isAvailable ?? true, b.trackStock ?? false, b.stockQty ?? 0, b.sortOrder ?? 0],
      );
      if (!r.length) throw notFound('Product');
      await writeGroups(c, id, b.optionGroups ?? []);
    });
    return getProduct(merchantId, id);
  });
  app.patch('/merchants/:merchantId/products/:id', async (req) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const b = parse(z.object({ isAvailable: z.boolean().optional(), stockQty: z.number().int().min(0).optional(), basePriceBaisa: z.number().int().min(0).optional() }), req.body);
    const r = await q(pool, `UPDATE products SET is_available = COALESCE($3,is_available), stock_qty = COALESCE($4,stock_qty), base_price_baisa = COALESCE($5,base_price_baisa), updated_at = now() WHERE id = $1 AND merchant_id = $2 RETURNING id`, [
      id, merchantId, b.isAvailable, b.stockQty, b.basePriceBaisa,
    ]);
    if (!r.length) throw notFound('Product');
    return getProduct(merchantId, id);
  });
  app.delete('/merchants/:merchantId/products/:id', async (req, reply) => {
    const { merchantId, id } = parse(mIdParams, req.params);
    requireMerchantPerm(req, merchantId, 'merchant.catalog:write');
    const r = await q(pool, `DELETE FROM products WHERE id = $1 AND merchant_id = $2 RETURNING id`, [id, merchantId]);
    if (!r.length) throw notFound('Product');
    reply.code(204);
  });
}
