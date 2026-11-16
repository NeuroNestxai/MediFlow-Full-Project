import type { OptionGroup, Product } from '../api/types';

/** Selected option ids per group id. */
export type Selection = Record<string, string[]>;

/** Default selection: the first available option of each required single-choice group (variant). */
export function defaultSelection(product: Pick<Product, 'optionGroups'>): Selection {
  const sel: Selection = {};
  for (const g of product.optionGroups) {
    if (g.minSelect >= 1 && g.maxSelect === 1) {
      const first = g.options.find((o) => o.isAvailable);
      sel[g.id] = first ? [first.id] : [];
    } else sel[g.id] = [];
  }
  return sel;
}

/** Toggle an option respecting the group's max: single-choice groups replace, multi-choice groups add up to max. */
export function toggleOption(group: OptionGroup, current: string[], optionId: string): string[] {
  const has = current.includes(optionId);
  if (group.maxSelect === 1) {
    if (has) return group.minSelect >= 1 ? current : [];
    return [optionId];
  }
  if (has) return current.filter((id) => id !== optionId);
  if (current.length >= group.maxSelect) return current;
  return [...current, optionId];
}

/** Unit price = base price + the price deltas of all selected options. */
export function unitPrice(product: Pick<Product, 'basePriceBaisa' | 'optionGroups'>, selection: Selection): number {
  let price = product.basePriceBaisa;
  for (const g of product.optionGroups) {
    for (const id of selection[g.id] ?? []) {
      const o = g.options.find((x) => x.id === id);
      if (o) price += o.priceDeltaBaisa;
    }
  }
  return price;
}

export function lineTotal(product: Pick<Product, 'basePriceBaisa' | 'optionGroups'>, selection: Selection, quantity: number) {
  return unitPrice(product, selection) * quantity;
}

export interface GroupError { groupId: string; min: number; max: number; count: number }

/** Groups whose selection count is outside [minSelect, maxSelect]. Empty array = valid. */
export function selectionErrors(product: Pick<Product, 'optionGroups'>, selection: Selection): GroupError[] {
  const out: GroupError[] = [];
  for (const g of product.optionGroups) {
    const count = (selection[g.id] ?? []).length;
    if (count < g.minSelect || count > g.maxSelect) out.push({ groupId: g.id, min: g.minSelect, max: g.maxSelect, count });
  }
  return out;
}

/** Lowest price a customer can pay (base + cheapest required options) — used for "from OMR x" labels. */
export function fromPrice(product: Pick<Product, 'basePriceBaisa' | 'optionGroups'>): number {
  let price = product.basePriceBaisa;
  for (const g of product.optionGroups) {
    if (g.minSelect <= 0) continue;
    const deltas = g.options.filter((o) => o.isAvailable).map((o) => o.priceDeltaBaisa).sort((a, b) => a - b);
    price += deltas.slice(0, g.minSelect).reduce((s, d) => s + d, 0);
  }
  return price;
}

export const flattenSelection = (selection: Selection): string[] => Object.values(selection).flat();
