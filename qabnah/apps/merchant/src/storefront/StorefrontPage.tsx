import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Icon, Modal, Textarea, defaultSelection, flattenSelection, fromPrice, selectionErrors, unitPrice, useI18n, useToast,
  type Product, type Selection, type Storefront,
} from '@qabnah/shared';
import { ProductConfigurator } from '../components/ProductConfigurator';
import { cart } from './cart';
import { useStorefront } from './StorefrontLayout';

function ProductModal({ product, sf, onClose, onAdded }: { product: Product | null; sf: Storefront; onClose: () => void; onAdded: () => void }) {
  const { t, pick, money } = useI18n();
  const [sel, setSel] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  useEffect(() => { if (product) { setSel(defaultSelection(product)); setQty(1); setNotes(''); setTried(false); setConfirmReplace(false); } }, [product]);
  if (!product) return null;
  const errors = selectionErrors(product, sel);
  const soldOut = !product.isAvailable || (product.trackStock && product.stockQty <= 0);
  const add = (force = false) => {
    setTried(true);
    if (errors.length || soldOut) return;
    const existing = cart.get();
    if (existing && existing.merchantId !== sf.merchant.id && !force) { setConfirmReplace(true); return; }
    if (force) cart.clear();
    const ids = flattenSelection(sel);
    const labels = product.optionGroups.flatMap((g) => g.options.filter((o) => ids.includes(o.id)).map((o) => ({ nameEn: o.nameEn, nameAr: o.nameAr })));
    cart.add(sf.merchant.id, sf.merchant.slug, {
      productId: product.id, nameEn: product.nameEn, nameAr: product.nameAr, imageUrl: product.imageUrl, unitPriceBaisa: unitPrice(product, sel),
      quantity: qty, optionIds: ids, optionLabels: labels, ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    onAdded();
  };
  return (
    <Modal open onClose={onClose} title={pick(product.nameEn, product.nameAr)}
      footer={<Button variant="primary" className="sf-primary" size="lg" block disabled={soldOut || !sf.merchant.isOpen} onClick={() => add()} data-testid="add-to-cart">
        {soldOut ? t('options.soldOut') : !sf.merchant.isOpen ? t('sf.closedNow') : `${t('storefront.addToCart')} · ${money(unitPrice(product, sel) * qty)}`}
      </Button>}>
      <div className="stack stack-lg">
        {product.imageUrl ? <img src={product.imageUrl} alt="" className="sf-modal-img" /> : null}
        <div className="stack stack-sm">
          {pick(product.descriptionEn, product.descriptionAr) ? <p className="muted">{pick(product.descriptionEn, product.descriptionAr)}</p> : null}
          <div className="row">
            <span className="strong">{money(product.basePriceBaisa)}</span>
            {product.compareAtPriceBaisa ? <s className="muted text-sm">{money(product.compareAtPriceBaisa)}</s> : null}
            {product.trackStock && product.stockQty > 0 && product.stockQty < 10 ? <Badge tone="warning">{t('sf.onlyLeft', { n: product.stockQty })}</Badge> : null}
          </div>
        </div>
        <ProductConfigurator product={product} selection={sel} onSelection={setSel} quantity={qty} onQuantity={setQty} showErrors={tried} />
        <Textarea label={t('sf.itemNotes')} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('sf.itemNotesPlaceholder')} optional />
        {confirmReplace ? (
          <Alert tone="warning" title={t('sf.replaceCartTitle')} action={<Button size="sm" variant="primary" onClick={() => add(true)}>{t('sf.replaceCart')}</Button>}>{t('sf.replaceCartBody')}</Alert>
        ) : null}
      </div>
    </Modal>
  );
}

function ProductCard({ p, onOpen }: { p: Product; onOpen: () => void }) {
  const { t, pick, money } = useI18n();
  const soldOut = !p.isAvailable || (p.trackStock && p.stockQty <= 0);
  const from = fromPrice(p);
  return (
    <button type="button" className={`sf-product ${soldOut ? 'sf-product--soldout' : ''}`} onClick={onOpen} data-testid="product-card" aria-label={`${pick(p.nameEn, p.nameAr)} — ${money(from)}`}>
      <div className="sf-product__body">
        <span className="strong">{pick(p.nameEn, p.nameAr)}</span>
        {pick(p.descriptionEn, p.descriptionAr) ? <span className="text-sm muted sf-product__desc">{pick(p.descriptionEn, p.descriptionAr)}</span> : null}
        <span className="row" style={{ ['--gap' as string]: '6px' }}>
          <span className="strong sf-price">{from !== p.basePriceBaisa || p.optionGroups.some((g) => g.options.some((o) => o.priceDeltaBaisa > 0)) ? `${t('catalog.from')} ` : ''}{money(from)}</span>
          {p.compareAtPriceBaisa ? <s className="text-xs muted">{money(p.compareAtPriceBaisa)}</s> : null}
          {soldOut ? <Badge tone="danger">{t('options.soldOut')}</Badge> : null}
        </span>
      </div>
      <div className="sf-product__img">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <Icon name="image" />}<span className="sf-product__add" aria-hidden="true">+</span></div>
    </button>
  );
}

export function StorefrontPage() {
  const { sf, openCart } = useStorefront();
  const { t, pick, money, num } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState<Product | null>(null);
  const [activeCat, setActiveCat] = useState<string>('all');
  const m = sf.merchant;
  const sections = useMemo(() => {
    const s = sf.categories.filter((c) => c.products.length).map((c) => ({ id: c.id, name: pick(c.nameEn, c.nameAr), products: c.products }));
    if (sf.uncategorized.length) s.push({ id: 'other', name: t('sf.more'), products: sf.uncategorized });
    return s;
  }, [sf, pick, t]);
  const tagline = pick(m.taglineEn, m.taglineAr);
  const shown = activeCat === 'all' ? sections : sections.filter((s) => s.id === activeCat);
  return (
    <main className="sf-main">
      <section className="sf-hero" style={m.coverUrl ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.05)), url("${m.coverUrl}")` } : undefined}>
        <div className="sf-hero__inner">
          <span className="sf-logo sf-logo--lg">{m.logoUrl ? <img src={m.logoUrl} alt="" /> : <span aria-hidden="true">{pick(m.nameEn, m.nameAr).slice(0, 1)}</span>}</span>
          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
            <h1>{pick(m.nameEn, m.nameAr)}</h1>
            {tagline ? <p>{tagline}</p> : null}
          </div>
        </div>
      </section>
      <div className="sf-info">
        <Badge tone={m.isOpen ? 'success' : 'danger'} dot>{m.isOpen ? t('store.open') : t('store.closed')}</Badge>
        <span><Icon name="clock" width={15} height={15} /> {t('sf.prep', { n: num(m.prepTimeMinutes, 0) })}</span>
        {m.ratingCount ? <span><Icon name="star" width={15} height={15} style={{ color: '#F4A300' }} /> {num(m.ratingAvg, 1)} ({num(m.ratingCount, 0)})</span> : null}
        {m.minOrderBaisa ? <span>{t('sf.minOrderShort', { amount: money(m.minOrderBaisa) })}</span> : null}
        <span>{[m.acceptsCod ? t('payment.method.cod') : null, m.acceptsOnline ? t('sf.payOnline') : null].filter(Boolean).join(' · ')}</span>
        {m.addressText ? <span className="muted"><Icon name="pin" width={15} height={15} /> {m.addressText}</span> : null}
      </div>
      {!m.isOpen ? <div className="sf-container"><Alert tone="warning" title={t('sf.closedTitle')}>{t('sf.closedBody')}</Alert></div> : null}
      {sf.banners.length ? (
        <div className={`sf-banners ${sf.banners.length === 1 ? 'sf-banners--single' : ''}`} role="region" aria-label={t('store.banners')}>
          {sf.banners.map((b) => {
            const title = pick(b.titleEn, b.titleAr);
            const inner = (<><img src={b.imageUrl} alt={title || ''} />{title ? <span className="sf-banner__title">{title}</span> : null}</>);
            return b.linkUrl ? <a key={b.id} className="sf-banner" href={b.linkUrl} target="_blank" rel="noopener noreferrer">{inner}</a> : <div key={b.id} className="sf-banner">{inner}</div>;
          })}
        </div>
      ) : null}
      {sections.length > 1 ? (
        <nav className="sf-cats" aria-label={t('catalog.categories')}>
          <button type="button" className={`sf-chip ${activeCat === 'all' ? 'sf-chip--on' : ''}`} aria-pressed={activeCat === 'all'} onClick={() => setActiveCat('all')}>{t('storefront.all')}</button>
          {sections.map((s) => <button key={s.id} type="button" className={`sf-chip ${activeCat === s.id ? 'sf-chip--on' : ''}`} aria-pressed={activeCat === s.id} onClick={() => setActiveCat(s.id)}>{s.name}</button>)}
        </nav>
      ) : null}
      <div className="sf-container stack stack-lg">
        {!sections.length ? <p className="muted">{t('sf.noProducts')}</p> : shown.map((s) => (
          <section key={s.id} aria-labelledby={`sec-${s.id}`} className="stack">
            <h2 id={`sec-${s.id}`}>{s.name}</h2>
            <div className="sf-grid">{s.products.map((p) => <ProductCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}</div>
          </section>
        ))}
      </div>
      <ProductModal product={open} sf={sf} onClose={() => setOpen(null)} onAdded={() => {
        const name = open ? pick(open.nameEn, open.nameAr) : '';
        setOpen(null);
        toast.push(<span>{t('sf.added', { name })} <button type="button" className="link-btn link-btn--light" onClick={openCart}>{t('sf.viewCart')}</button></span>);
      }} />
    </main>
  );
}
