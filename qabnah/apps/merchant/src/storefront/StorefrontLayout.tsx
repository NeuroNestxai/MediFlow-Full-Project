import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Button, Drawer, ErrorState, Icon, Loading, Photo, Price, isApiError, useDocumentTitle, useI18n, type Storefront, type StorefrontMerchant } from '@qabnah/shared';
import { publicApi } from '../api';
import { cart, cartCount, cartSubtotal, useCart } from './cart';
import { useConsumer } from './ConsumerAuth';

export interface StorefrontCtx { sf: Storefront; openCart: () => void }
export const useStorefront = () => useOutletContext<StorefrontCtx>();

export function useStorefrontQuery(slug: string | undefined) {
  return useQuery({ queryKey: ['sf', slug], queryFn: () => publicApi.get<Storefront>(`/stores/${slug}`, { auth: false }), enabled: !!slug, staleTime: 30_000, refetchInterval: 60_000 });
}

/** Choose readable text (ink or white) on top of a brand colour. */
export function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#0B1F1C' : '#FFFFFF';
}

export function brandStyle(brand: string, accent: string): CSSProperties {
  return { ['--brand' as string]: brand, ['--brand-on' as string]: onColor(brand), ['--brand-accent' as string]: accent, ['--brand-accent-on' as string]: onColor(accent) };
}

/** Applies the merchant's brand colours to the whole document (sheets and dialogs are portaled to <body>). */
export function useBrandScope(brand?: string, accent?: string) {
  useEffect(() => {
    if (!brand) return;
    const body = document.body;
    const vars = brandStyle(brand, accent ?? brand) as Record<string, string>;
    body.dataset.sf = '1';
    for (const [k, v] of Object.entries(vars)) body.style.setProperty(k, v);
    return () => {
      delete body.dataset.sf;
      for (const k of Object.keys(vars)) body.style.removeProperty(k);
    };
  }, [brand, accent]);
}

/** Store logo chip: the logo image, or the merchant's initial on their brand colour (the only allowed letter avatar). */
export function StoreLogo({ m, size = 56 }: { m: Pick<StorefrontMerchant, 'logoUrl' | 'nameEn' | 'nameAr' | 'brandColor'>; size?: number }) {
  const { pick } = useI18n();
  return (
    <span className="store-logo" style={{ inlineSize: size, blockSize: size, fontSize: size * 0.42, background: m.brandColor, color: onColor(m.brandColor) }}>
      {m.logoUrl ? <img src={m.logoUrl} alt="" /> : <span aria-hidden="true">{pick(m.nameEn, m.nameAr).trim().slice(0, 1)}</span>}
    </span>
  );
}

function CartSheet({ open, onClose, sf }: { open: boolean; onClose: () => void; sf: Storefront }) {
  const { t, pick, num, money } = useI18n();
  const c = useCart();
  const nav = useNavigate();
  const mine = c && c.merchantId === sf.merchant.id ? c : null;
  const subtotal = cartSubtotal(mine);
  const belowMin = sf.merchant.minOrderBaisa > 0 && subtotal < sf.merchant.minOrderBaisa;
  return (
    <Drawer open={open} onClose={onClose} title={t('sf.cart')} subtitle={pick(sf.merchant.nameEn, sf.merchant.nameAr)} className="sf-sheet"
      footer={mine ? (
        <div className="stack w-full" style={{ ['--gap' as string]: '10px' }}>
          <div className="row between"><span className="muted">{t('orders.subtotal')}</span><Price baisa={subtotal} className="text-lg" /></div>
          {belowMin ? <span className="text-sm danger-text">{t('sf.minOrder', { amount: money(sf.merchant.minOrderBaisa) })}</span> : <span className="text-xs muted">{t('sf.feesAtCheckout')}</span>}
          <Button variant="primary" size="lg" block disabled={belowMin || !sf.merchant.isOpen} onClick={() => { onClose(); nav(`/s/${sf.merchant.slug}/checkout`); }}>
            {sf.merchant.isOpen ? t('sf.checkout') : t('sf.closedNow')}
          </Button>
        </div>
      ) : undefined}>
      {!mine ? (
        <div className="sf-empty">
          <span className="sf-empty__icon"><Icon name="bag" /></span>
          <strong>{t('sf.cartEmpty')}</strong>
          <span className="muted text-sm">{c && c.merchantId !== sf.merchant.id ? t('sf.otherStoreCart', { slug: c.slug }) : t('sf.cartEmptyHint')}</span>
        </div>
      ) : (
        <ul className="cart-lines">
          {mine.lines.map((l) => (
            <li key={l.key} className="cart-line">
              <Photo src={l.imageUrl} category={sf.merchant.category} tint={sf.merchant.brandColor} className="cart-line__photo photo--sm" />
              <div className="grow stack" style={{ ['--gap' as string]: '2px' }}>
                <span className="strong">{pick(l.nameEn, l.nameAr)}</span>
                {l.optionLabels.length ? <span className="text-sm muted">{l.optionLabels.map((o) => pick(o.nameEn, o.nameAr)).join(' · ')}</span> : null}
                {l.notes ? <span className="text-sm muted">“{l.notes}”</span> : null}
                <div className="row between" style={{ marginBlockStart: 6 }}>
                  <div className="qty" role="group" aria-label={t('options.quantity')}>
                    <button type="button" className="btn btn--icon btn--sm" aria-label={l.quantity === 1 ? t('sf.removeItem') : t('options.decrease')} onClick={() => cart.setQuantity(l.key, l.quantity - 1)}>{l.quantity === 1 ? <Icon name="trash" /> : '−'}</button>
                    <span className="qty__value">{num(l.quantity, 0)}</span>
                    <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.increase')} onClick={() => cart.setQuantity(l.key, l.quantity + 1)}>+</button>
                  </div>
                  <Price baisa={l.unitPriceBaisa * l.quantity} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

/** Header: transparent over the cover (store home) → solid white on scroll. */
function StoreHeader({ sf, overCover }: { sf: Storefront; overCover: boolean }) {
  const { t, pick, toggleLang, lang } = useI18n();
  const { me } = useConsumer();
  const [solid, setSolid] = useState(!overCover);
  useEffect(() => {
    if (!overCover) { setSolid(true); return; }
    const on = () => setSolid(window.scrollY > 140);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [overCover]);
  const m = sf.merchant;
  return (
    <header className={`sf-header ${solid ? 'sf-header--solid' : ''}`}>
      <Link to="/stores" className="sf-header__icon" aria-label={t('sf.allStores')}><img src="/brand/mark.svg" alt="" width={36} height={36} /></Link>
      <Link to={`/s/${m.slug}`} className="sf-header__title truncate" tabIndex={solid ? 0 : -1} aria-hidden={!solid}>{pick(m.nameEn, m.nameAr)}</Link>
      <span className="grow" />
      <button type="button" className="sf-header__icon sf-header__lang" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{lang === 'ar' ? 'EN' : 'ع'}</button>
      {me ? <Link to={`/s/${m.slug}/account`} className="sf-header__icon" data-testid="account-link" aria-label={t('account.link')}><Icon name="user" /></Link> : null}
    </header>
  );
}

export function StorefrontShell({ sf, children, onCart, overCover = false }: { sf: Storefront; children: ReactNode; onCart?: () => void; overCover?: boolean }) {
  const { t, num } = useI18n();
  const c = useCart();
  const m = sf.merchant;
  const count = c?.merchantId === m.id ? cartCount(c) : 0;
  useBrandScope(m.brandColor, m.accentColor);
  return (
    <div className={`sf ${count && onCart ? 'sf--has-cart' : ''}`}>
      <StoreHeader sf={sf} overCover={overCover} />
      {children}
      <footer className="sf-footer">
        <span>{t('sf.poweredBy')}</span>
        <Link to="/stores" aria-label={t('app.name')}><img src="/brand/logo.svg" alt="" height={24} /></Link>
      </footer>
      {count && onCart ? (
        <div className="cart-bar on-night" role="region" aria-label={t('sf.cart')}>
          <button type="button" className="cart-bar__btn" onClick={onCart} aria-label={t('sf.openCart', { n: count })} data-testid="cart-button">
            <span className="cart-bar__count">{num(count, 0)}</span>
            <span className="cart-bar__label">{t('sf.viewCart')}</span>
            <Price baisa={cartSubtotal(c)} className="cart-bar__total" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function StorefrontLayout() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const loc = useLocation();
  const q = useStorefrontQuery(slug);
  const [cartOpen, setCartOpen] = useState(false);
  useDocumentTitle(q.data ? `${pick(q.data.merchant.nameEn, q.data.merchant.nameAr)} · ${t('app.name')}` : t('app.name'));
  if (q.isLoading) return <div className="sf"><div className="sf-skeleton-cover skeleton" /><div className="sf-container"><Loading lines={6} /></div></div>;
  if (q.isError || !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404;
    return (
      <div className="auth-page">
        <div className="card auth-card">
          {notFound ? (
            <div className="sf-empty"><span className="sf-empty__icon"><Icon name="store" /></span><strong>{t('sf.notFound')}</strong><span className="muted text-sm">{t('sf.notFoundHint')}</span><Link className="btn btn--primary" to="/stores">{t('sf.allStores')}</Link></div>
          ) : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        </div>
      </div>
    );
  }
  const isHome = loc.pathname.replace(/\/+$/, '') === `/s/${slug}`;
  const showCart = isHome;
  return (
    <StorefrontShell sf={q.data} onCart={showCart ? () => setCartOpen(true) : undefined} overCover={isHome}>
      <Outlet context={{ sf: q.data, openCart: () => setCartOpen(true) } satisfies StorefrontCtx} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} sf={q.data} />
    </StorefrontShell>
  );
}
