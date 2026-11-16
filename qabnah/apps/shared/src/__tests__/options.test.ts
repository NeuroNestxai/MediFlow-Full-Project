import { describe, expect, it } from 'vitest';
import type { Product } from '../api/types';
import { defaultSelection, fromPrice, selectionErrors, toggleOption, unitPrice } from '../domain/options';

const shawarma: Pick<Product, 'basePriceBaisa' | 'optionGroups'> = {
  basePriceBaisa: 900,
  optionGroups: [
    { id: 'size', kind: 'variant', nameEn: 'Size', nameAr: 'الحجم', minSelect: 1, maxSelect: 1, options: [
      { id: 'reg', nameEn: 'Regular', nameAr: 'عادي', priceDeltaBaisa: 0, isAvailable: true },
      { id: 'lg', nameEn: 'Large', nameAr: 'كبير', priceDeltaBaisa: 400, isAvailable: true },
    ] },
    { id: 'extras', kind: 'addon', nameEn: 'Extras', nameAr: 'إضافات', minSelect: 0, maxSelect: 2, options: [
      { id: 'cheese', nameEn: 'Cheese', nameAr: 'جبن', priceDeltaBaisa: 200, isAvailable: true },
      { id: 'garlic', nameEn: 'Garlic', nameAr: 'ثوم', priceDeltaBaisa: 100, isAvailable: true },
      { id: 'fries', nameEn: 'Fries', nameAr: 'بطاطس', priceDeltaBaisa: 150, isAvailable: true },
    ] },
  ],
};

describe('option selection pricing', () => {
  it('pre-selects the first variant and prices base + deltas', () => {
    const sel = defaultSelection(shawarma);
    expect(sel).toEqual({ size: ['reg'], extras: [] });
    expect(unitPrice(shawarma, sel)).toBe(900);
    expect(unitPrice(shawarma, { size: ['lg'], extras: ['cheese', 'garlic'] })).toBe(1600);
  });
  it('single-choice groups replace the selection and cannot be emptied when required', () => {
    const g = shawarma.optionGroups[0];
    expect(toggleOption(g, ['reg'], 'lg')).toEqual(['lg']);
    expect(toggleOption(g, ['lg'], 'lg')).toEqual(['lg']);
  });
  it('multi-choice groups respect maxSelect', () => {
    const g = shawarma.optionGroups[1];
    let cur: string[] = [];
    cur = toggleOption(g, cur, 'cheese');
    cur = toggleOption(g, cur, 'garlic');
    cur = toggleOption(g, cur, 'fries');
    expect(cur).toEqual(['cheese', 'garlic']);
    expect(toggleOption(g, cur, 'cheese')).toEqual(['garlic']);
  });
  it('reports groups outside min/max', () => {
    expect(selectionErrors(shawarma, { size: [], extras: [] })).toEqual([{ groupId: 'size', min: 1, max: 1, count: 0 }]);
    expect(selectionErrors(shawarma, { size: ['reg'], extras: [] })).toEqual([]);
  });
  it('computes the cheapest "from" price', () => {
    expect(fromPrice(shawarma)).toBe(900);
    expect(fromPrice({ basePriceBaisa: 1000, optionGroups: [{ ...shawarma.optionGroups[0], options: [{ id: 'a', nameEn: 'a', nameAr: 'a', priceDeltaBaisa: 300, isAvailable: true }] }] })).toBe(1300);
  });
});
