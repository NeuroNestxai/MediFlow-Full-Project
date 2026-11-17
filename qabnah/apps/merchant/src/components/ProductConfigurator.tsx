import { useId } from 'react';
import { Price, selectionErrors, toggleOption, unitPrice, useI18n, type OptionGroup, type Product, type Selection } from '@qabnah/shared';

type PricedProduct = Pick<Product, 'basePriceBaisa' | 'optionGroups' | 'compareAtPriceBaisa'>;

function groupRule(g: OptionGroup, t: (k: string, v?: Record<string, string | number>) => string) {
  if (g.maxSelect === 1 && g.minSelect >= 1) return t('options.chooseOne');
  if (g.minSelect > 0) return t('options.chooseBetween', { min: g.minSelect, max: g.maxSelect });
  return t('options.upTo', { max: g.maxSelect });
}

/** Variant (radio) and add-on (checkbox, min/max) selection for a product. Controlled. */
export function ProductOptionPicker({ product, value, onChange, showErrors }: { product: PricedProduct; value: Selection; onChange: (s: Selection) => void; showErrors?: boolean }) {
  const { t, pick, num } = useI18n();
  const uid = useId();
  const errors = showErrors ? selectionErrors(product, value) : [];
  return (
    <div className="stack stack-lg">
      {product.optionGroups.map((g, gi) => {
        const selected = value[g.id] ?? [];
        const single = g.maxSelect === 1;
        const full = !single && selected.length >= g.maxSelect;
        const err = errors.find((e) => e.groupId === g.id);
        const name = `${uid}-g${gi}`;
        return (
          <fieldset key={g.id || gi} className="option-group" aria-describedby={`${name}-rule`}>
            <legend className="option-group__legend">
              <span className="strong">{pick(g.nameEn, g.nameAr)}</span>
              <span id={`${name}-rule`} className={`badge ${g.minSelect > 0 ? 'badge--warning' : ''}`}>{g.minSelect > 0 ? `${t('options.required')} · ` : ''}{groupRule(g, t)}</span>
            </legend>
            {g.options.map((o, oi) => {
              const checked = selected.includes(o.id);
              const disabled = !o.isAvailable || (!checked && full);
              return (
                <label key={o.id || oi} className={`option-row ${checked ? 'option-row--on' : ''} ${disabled ? 'option-row--disabled' : ''}`}>
                  <input type={single ? 'radio' : 'checkbox'} name={name} checked={checked} disabled={disabled}
                    onChange={() => onChange({ ...value, [g.id]: toggleOption(g, selected, o.id) })} />
                  <span className="grow">{pick(o.nameEn, o.nameAr)}{!o.isAvailable ? <span className="muted text-sm"> · {t('options.soldOut')}</span> : null}</span>
                  {o.priceDeltaBaisa ? <Price baisa={o.priceDeltaBaisa} signed className="option-row__delta" /> : null}
                </label>
              );
            })}
            {err ? <span className="field__error" role="alert">{t('options.selectError', { min: num(err.min, 0), max: num(err.max, 0) })}</span> : null}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Picker + quantity stepper + live price. */
export function ProductConfigurator({ product, selection, onSelection, quantity, onQuantity, showErrors }: {
  product: PricedProduct; selection: Selection; onSelection: (s: Selection) => void; quantity: number; onQuantity: (q: number) => void; showErrors?: boolean;
}) {
  const { t, money, num } = useI18n();
  const unit = unitPrice(product, selection);
  return (
    <div className="stack stack-lg">
      <ProductOptionPicker product={product} value={selection} onChange={onSelection} showErrors={showErrors} />
      <div className="row between">
        <div className="qty" role="group" aria-label={t('options.quantity')}>
          <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.decrease')} disabled={quantity <= 1} onClick={() => onQuantity(Math.max(1, quantity - 1))}>−</button>
          <span className="qty__value" aria-live="polite" data-testid="qty">{num(quantity, 0)}</span>
          <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.increase')} disabled={quantity >= 99} onClick={() => onQuantity(Math.min(99, quantity + 1))}>+</button>
        </div>
        <div className="stack" style={{ ['--gap' as string]: '0px', alignItems: 'flex-end' }}>
          <span className="text-xs muted">{t('options.unitPrice')}: <span data-testid="unit-price">{money(unit)}</span></span>
          <span className="text-lg strong" data-testid="line-total" aria-live="polite">{money(unit * quantity)}</span>
        </div>
      </div>
    </div>
  );
}
