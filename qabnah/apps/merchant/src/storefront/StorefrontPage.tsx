import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Badge, Button, Icon, Modal, Photo, Price, Textarea, defaultSelection, flattenSelection, fromPrice, selectionErrors, unitPrice, useI18n,
  type Product, type Selection, type Storefront,
} from '@qabnah/shared';
import { ProductOptionPicker } from '../components/ProductConfigurator';
import { cart } from './cart';
import { StoreLogo, useStorefront } from './StorefrontLayout';

/** Product sheet: big photo, options as selectable rows, quantity stepper and a sticky add bar with the live price. */
function ProductSheet({ product, sf, onClose, onAdded }: { product: Product | null; sf: Storefront; onClose: () => void; onAdded: () => void }) {
  const { t, pick, num } = useI18n();
  const [sel, setSel] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  useEffect(() => { if (product) { setSel(defaultSelection(product)); setQty(1); setNotes(''); setTried(false); setConfirmReplace(false); } }, [product]);
  if (!product) return null;
  const errors = selectionErrors(product, sel);
  const soldOut = !product.isAvailable || (product.trackStock && product.stockQty <= 0);
  const unit = unitPrice(product, sel);
  const add = (force = false) => {
    setTried(true);
    if (errors.length || soldOut) return;
    const existing = cart.get();
    if (existing && existing.merchantId !== sf.merchant.id && !force) { setConfirmReplace(true); return; }
    if (force) cart.clear();
    const ids = flattenSelection(sel);
    const labels = product.optionGroups.flatMap((g) => g.options.filter((o) => ids.includes(o.id)).map((o) => ({ nameEn: o.nameEn, nameAr: o.nameAr })));
    cart.add(sf.merchant.id, sf.merchant.slug, {
      productId: product.id, nameEn: product.nameEn, nameAr: product.nameAr, imageUrl: product.imageUrl, unitPriceBaisa: unit,
      quantity: qty, optionIds: ids, optionLabels: labels, ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    onAdded();
  };
  const desc = pick(product.descriptionEn, product.descriptionAr);
  return (
    <Modal open onClose={onClose} title={pick(product.nameEn, product.nameAr)} className="product-sheet"
      media={<Photo src={product.imageUrl} ratio="16 / 10" category={sf.merchant.category} tint={sf.merchant.brandColor} eager alt={pick(product.nameEn, product.nameAr)} />}
      footer={
        <div className="add-bar">
          <div className="qty" role="group" aria-label={t('options.quantity')}>
            <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.decrease')} disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span className="qty__value" aria-live="polite">{num(qty, 0)}</span>
            <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.increase')} disabled={qty >= 99} onClick={() => setQty(Math.min(99, qty + 1))}>+</button>
          </div>
          <Button variant="primary" size="lg" className="add-bar__cta" disabled={soldOut || !sf.merchant.isOpen} onClick={() => add()} data-testid="add-to-cart">
            {soldOut ? t('options.soldOut') : !sf.merchant.isOpen ? t('sf.closedNow') : <><span>{t('storefront.addToCart')}</span><Price baisa={unit * qty} className="price--on-dark" testId="line-total" /></>}
          </Button>
        </div>
      }>
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          {desc ? <p className="muted">{desc}</p> : null}
          <div className="row">
            <Price baisa={unit} className="text-lg" testId="unit-price" />
            {product.compareAtPriceBaisa && product.compareAtPriceBaisa > unit ? <s className="muted text-sm"><Price baisa={product.compareAtPriceBaisa} /></s> : null}
            {product.trackStock && product.stockQty > 0 && product.stockQty < 10 ? <Badge tone="warning" dot>{t('sf.onlyLeft', { n: num(product.stockQty, 0) })}</Badge> : null}
          </div>
        </div>
        {product.optionGroups.length ? <ProductOptionPicker product={product} value={sel} onChange={setSel} showErrors={tried} /> : null}
        <Textarea label={t('sf.itemNotes')} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('sf.itemNotesPlaceholder')} optional />
        {confirmReplace ? (
          <Alert tone="warning" title={t('sf.replaceCartTitle')} action={<Button size="sm" variant="primary" onClick={() => add(true)}>{t('sf.replaceCart')}</Button>}>{t('sf.replaceCartBody')}</Alert>
        ) : null}
      </div>
    </Modal>
  );
}

/** Product row: photo on the leading side, title, one-line description, price and a circular add button in the brand colour. */
function ProductRow({ p, sf, onOpen }: { p: Product; sf: Storefront; onOpen: () => void }) {
  const { t, pick, money } = useI18n();
  const soldOut = !p.isAvailable || (p.trackStock && p.stockQty <= 0);
  const from = fromPrice(p);
  const hasFrom = from !== p.basePriceBaisa || p.optionGroups.some((g) => g.options.some((o) => o.priceDeltaBaisa > 0));
  const desc = pick(p.descriptionEn, p.descriptionAr);
  return (
    <button type="button" className={`product-row ${soldOut ? 'product-row--soldout' : ''}`} onClick={onOpen} data-testid="product-card" aria-label={`${pick(p.nameEn, p.nameAr)} — ${money(from)}`}>
      <Photo src={p.imageUrl} category={sf.merchant.category} tint={sf.merchant.brandColor} className="product-row__photo" />
      <span className="product-row__body">
        <span className="product-row__title">{pick(p.nameEn, p.nameAr)}</span>
        {desc ? <span className="product-row__desc">{desc}</span> : null}
        <span className="product-row__foot">
          <span className="product-row__price">
            {hasFrom ? <span className="text-xs muted">{t('catalog.from')}</span> : null}
            <Price baisa={from} />
            {p.compareAtPriceBaisa && p.compareAtPriceBaisa > from ? <s className="text-xs muted"><Price baisa={p.compareAtPriceBaisa} /></s> : null}
          </span>
          {soldOut ? <Badge tone="neutral">{t('options.soldOut')}</Badge> : <span className="product-row__add" aria-hidden="true"><Icon name="plus" /></span>}
        </span>
      </span>
    </button>
  );
}

export function StorefrontPage() {
  const { sf } = useStorefront();
  const { t, pick, money, num } = useI18n();
  const [open, setOpen] = useState<Product | null>(null);
  const m = sf.merchant;
  const sections = useMemo(() => {
    const s = sf.categories.filter((c) => c.products.length).map((c) => ({ id: c.id, name: pick(c.nameEn, c.nameAr), products: c.products }));
    if (sf.uncategorized.length) s.push({ id: 'other', name: t('sf.more'), products: sf.uncategorized });
    return s;
  }, [sf, pick, t]);
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const tabsRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);

  // Scroll-spy: the section nearest the top (below the sticky bars) is the active tab.
  useEffect(() => {
    if (sections.length < 2) return;
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(`sec-${s.id}`);
        if (el && el.getBoundingClientRect().top <= 140) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);
  const jump = (id: string) => {
    setActive(id);
    lockUntil.current = Date.now() + 700;
    const el = document.getElementById(`sec-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 118, behavior: 'smooth' });
  };

  const tagline = pick(m.taglineEn, m.taglineAr);
  const name = pick(m.nameEn, m.nameAr);
  return (
    <main className="sf-main">
      <section className="sf-cover">
        {m.coverUrl ? <img className="sf-cover__blur" src={m.coverUrl} alt="" aria-hidden="true" /> : null}
        <div className="sf-cover__inner">
          <Photo src={m.coverUrl} ratio="auto" category={m.category} tint={m.brandColor} eager scrim className="sf-cover__photo" alt="" />
          <div className="sf-cover__text">
            <h1>{name}</h1>
            {tagline ? <p>{tagline}</p> : null}
          </div>
        </div>
      </section>
      <div className="sf-identity">
        <StoreLogo m={m} />
        <div className="sf-pills">
          <span className={`pill ${m.isOpen ? 'pill--open' : 'pill--closed'}`}><span className="pill__dot" />{m.isOpen ? t('store.open') : t('store.closed')}</span>
          <span className="pill"><Icon name="clock" />{t('sf.prep', { n: num(m.prepTimeMinutes, 0) })}</span>
          {m.minOrderBaisa ? <span className="pill">{t('sf.minOrderShort', { amount: money(m.minOrderBaisa) })}</span> : null}
          {m.ratingCount ? <span className="pill"><Icon name="star" style={{ color: '#F4A300' }} />{num(m.ratingAvg, 1)} ({num(m.ratingCount, 0)})</span> : null}
          {m.acceptsCod ? <span className="pill"><Icon name="cash" />{t('payment.method.cod')}</span> : null}
          {m.acceptsOnline ? <span className="pill"><Icon name="card" />{t('sf.payOnline')}</span> : null}
        </div>
        {m.addressText ? <p className="sf-address"><Icon name="pin" /> {m.addressText}</p> : null}
      </div>
      {!m.isOpen ? <div className="sf-container"><Alert tone="warning" title={t('sf.closedTitle')}>{t('sf.closedBody')}</Alert></div> : null}
      {sf.banners.length ? (
        <div className={`sf-banners ${sf.banners.length === 1 ? 'sf-banners--single' : ''}`} role="region" aria-label={t('store.banners')}>
          {sf.banners.map((b) => {
            const title = pick(b.titleEn, b.titleAr);
            const inner = (<><img src={b.imageUrl} alt="" loading="lazy" /><span className="photo__scrim" />{title ? <span className="sf-banner__title">{title}</span> : null}</>);
            return b.linkUrl ? <a key={b.id} className="sf-banner" href={b.linkUrl} target="_blank" rel="noopener noreferrer">{inner}</a> : <div key={b.id} className="sf-banner">{inner}</div>;
          })}
        </div>
      ) : null}
      {sections.length > 1 ? (
        <nav className="sf-tabs" aria-label={t('catalog.categories')} ref={tabsRef}>
          <div className="sf-tabs__inner">
            {sections.map((s) => (
              <button key={s.id} type="button" data-tab={s.id} className={`sf-tab ${active === s.id ? 'sf-tab--on' : ''}`} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>{s.name}</button>
            ))}
          </div>
        </nav>
      ) : null}
      <div className="sf-container sf-menu">
        {!sections.length ? <p className="muted">{t('sf.noProducts')}</p> : sections.map((s) => (
          <section key={s.id} id={`sec-${s.id}`} aria-labelledby={`h-${s.id}`} className="sf-section">
            <h2 id={`h-${s.id}`}>{s.name} <span className="sf-section__count">{num(s.products.length, 0)}</span></h2>
            <div className="product-list">{s.products.map((p) => <ProductRow key={p.id} p={p} sf={sf} onOpen={() => setOpen(p)} />)}</div>
          </section>
        ))}
      </div>
      <ProductSheet product={open} sf={sf} onClose={() => setOpen(null)} onAdded={() => setOpen(null)} />
    </main>
  );
}
