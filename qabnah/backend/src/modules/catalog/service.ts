import { q, type Queryable } from '../../db/pool.js';

export function optionGroupDto(g: any, options: any[]) {
  return {
    id: g.id,
    kind: g.kind,
    nameEn: g.name_en,
    nameAr: g.name_ar,
    minSelect: g.min_select,
    maxSelect: g.max_select,
    options: options.map((o) => ({ id: o.id, nameEn: o.name_en, nameAr: o.name_ar, priceDeltaBaisa: o.price_delta_baisa, isAvailable: o.is_available })),
  };
}

export function productDto(p: any, groups: any[]) {
  return {
    id: p.id,
    categoryId: p.category_id,
    nameEn: p.name_en,
    nameAr: p.name_ar,
    descriptionEn: p.description_en,
    descriptionAr: p.description_ar,
    imageUrl: p.image_url,
    sku: p.sku,
    basePriceBaisa: p.base_price_baisa,
    compareAtPriceBaisa: p.compare_at_price_baisa,
    isAvailable: p.is_available,
    trackStock: p.track_stock,
    stockQty: p.stock_qty,
    sortOrder: p.sort_order,
    optionGroups: groups,
  };
}

/** Load products (with option groups and options) matching a WHERE clause on alias p. */
export async function loadProducts(db: Queryable, where: string, params: unknown[]) {
  const products = await q(db, `SELECT p.* FROM products p WHERE ${where} ORDER BY p.sort_order, p.name_en`, params);
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const groups = await q(db, `SELECT * FROM product_option_groups WHERE product_id = ANY($1) ORDER BY sort_order, name_en`, [ids]);
  const options = groups.length
    ? await q(db, `SELECT * FROM product_options WHERE group_id = ANY($1) ORDER BY sort_order, price_delta_baisa`, [groups.map((g) => g.id)])
    : [];
  return products.map((p) =>
    productDto(
      p,
      groups.filter((g) => g.product_id === p.id).map((g) => optionGroupDto(g, options.filter((o) => o.group_id === g.id))),
    ),
  );
}

export interface SelectedOption { id: string; groupId: string; groupNameEn: string; groupNameAr: string; nameEn: string; nameAr: string; priceDeltaBaisa: number }

/**
 * Validate an option selection against a product's groups. Returns the selected options or an error message.
 * Pure function — unit tested.
 */
export function validateOptions(product: ReturnType<typeof productDto>, optionIds: string[]): { ok: true; selected: SelectedOption[] } | { ok: false; error: string } {
  const unique = [...new Set(optionIds)];
  if (unique.length !== optionIds.length) return { ok: false, error: 'Duplicate option selected' };
  const selected: SelectedOption[] = [];
  const byId = new Map<string, { group: any; option: any }>();
  for (const g of product.optionGroups) for (const o of g.options) byId.set(o.id, { group: g, option: o });
  for (const id of unique) {
    const hit = byId.get(id);
    if (!hit) return { ok: false, error: 'Option does not belong to this product' };
    if (!hit.option.isAvailable) return { ok: false, error: `${hit.option.nameEn} is not available` };
    selected.push({ id, groupId: hit.group.id, groupNameEn: hit.group.nameEn, groupNameAr: hit.group.nameAr, nameEn: hit.option.nameEn, nameAr: hit.option.nameAr, priceDeltaBaisa: hit.option.priceDeltaBaisa });
  }
  for (const g of product.optionGroups) {
    const n = selected.filter((s) => s.groupId === g.id).length;
    if (n < g.minSelect) return { ok: false, error: `Choose at least ${g.minSelect} for ${g.nameEn}` };
    if (n > g.maxSelect) return { ok: false, error: `Choose at most ${g.maxSelect} for ${g.nameEn}` };
  }
  return { ok: true, selected };
}
