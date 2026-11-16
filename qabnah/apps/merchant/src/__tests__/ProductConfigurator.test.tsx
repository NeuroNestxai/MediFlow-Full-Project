import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, defaultSelection, type Product, type Selection } from '@qabnah/shared';
import { ProductConfigurator } from '../components/ProductConfigurator';
import { dictionaries } from '../i18n';

const product: Product = {
  id: 'p1', categoryId: null, nameEn: 'Chicken Shawarma', nameAr: 'شاورما دجاج', descriptionEn: null, descriptionAr: null, imageUrl: null, sku: null,
  basePriceBaisa: 900, compareAtPriceBaisa: null, isAvailable: true, trackStock: false, stockQty: 0, sortOrder: 0,
  optionGroups: [
    { id: 'size', kind: 'variant', nameEn: 'Size', nameAr: 'الحجم', minSelect: 1, maxSelect: 1, options: [
      { id: 'reg', nameEn: 'Regular', nameAr: 'عادي', priceDeltaBaisa: 0, isAvailable: true },
      { id: 'lg', nameEn: 'Large', nameAr: 'كبير', priceDeltaBaisa: 400, isAvailable: true },
    ] },
    { id: 'extras', kind: 'addon', nameEn: 'Extras', nameAr: 'إضافات', minSelect: 0, maxSelect: 2, options: [
      { id: 'cheese', nameEn: 'Cheese', nameAr: 'جبن', priceDeltaBaisa: 200, isAvailable: true },
      { id: 'garlic', nameEn: 'Extra garlic', nameAr: 'ثوم', priceDeltaBaisa: 100, isAvailable: true },
      { id: 'fries', nameEn: 'Fries inside', nameAr: 'بطاطس', priceDeltaBaisa: 150, isAvailable: true },
    ] },
  ],
};

function Harness() {
  const [sel, setSel] = useState<Selection>(() => defaultSelection(product));
  const [qty, setQty] = useState(1);
  return <ProductConfigurator product={product} selection={sel} onSelection={setSel} quantity={qty} onQuantity={setQty} />;
}

const renderEn = () => {
  localStorage.setItem('test.cfg.lang', JSON.stringify('en'));
  return render(<I18nProvider dictionaries={dictionaries} defaultLang="en" storageKey="test.cfg.lang"><Harness /></I18nProvider>);
};

describe('ProductConfigurator (option picker price calculation)', () => {
  it('starts with the default variant and the base price', () => {
    renderEn();
    expect(screen.getByLabelText(/^Regular/)).toBeChecked();
    expect(screen.getByTestId('line-total')).toHaveTextContent('OMR 0.900');
  });

  it('adds variant and add-on deltas and multiplies by quantity', async () => {
    const user = userEvent.setup();
    renderEn();
    await user.click(screen.getByLabelText(/^Large/));
    await user.click(screen.getByLabelText(/^Cheese/));
    expect(screen.getByTestId('unit-price')).toHaveTextContent('OMR 1.500');
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(screen.getByTestId('qty')).toHaveTextContent('2');
    expect(screen.getByTestId('line-total')).toHaveTextContent('OMR 3.000');
  });

  it('enforces the add-on maximum by disabling further options', async () => {
    const user = userEvent.setup();
    renderEn();
    await user.click(screen.getByLabelText(/^Cheese/));
    await user.click(screen.getByLabelText(/^Extra garlic/));
    expect(screen.getByLabelText(/^Fries inside/)).toBeDisabled();
    expect(screen.getByTestId('line-total')).toHaveTextContent('OMR 1.200');
    await user.click(screen.getByLabelText(/^Cheese/));
    expect(screen.getByLabelText(/^Fries inside/)).toBeEnabled();
    expect(screen.getByTestId('line-total')).toHaveTextContent('OMR 1.000');
  });
});
