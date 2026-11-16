import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Button, Drawer, EmptyState, ErrorState, Icon, Loading, isApiError, useDocumentTitle, useI18n, type Storefront } from '@qabnah/shared';
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

function CartDrawer({ open, onClose, sf }: { open: boolean; onClose: () => void; sf: Storefront }) {
  const { t, pick, money, num } = useI18n();
  const c = useCart();
  const nav = useNavigate();
  const mine = c && c.merchantId === sf.merchant.id ? c : null;
  const subtotal = cartSubtotal(mine);
  const belowMin = sf.merchant.minOrderBaisa > 0 && subtotal < sf.merchant.minOrderBaisa;
  return (
    <Drawer open={open} onClose={onClose} title={t('sf.cart')} subtitle={pick(sf.merchant.nameEn, sf.merchant.nameAr)}
      footer={mine ? (
        <div className="stack w-full">
          <div className="row between"><span className="muted">{t('orders.subtotal')}</span><strong className="num">{money(subtotal)}</strong></div>
          {belowMin ? <span className="text-sm danger-text">{t('sf.minOrder', { amount: money(sf.merchant.minOrderBaisa) })}</span> : null}
          <Button variant="primary" className="sf-primary" size="lg" block disabled={belowMin || !sf.merchant.isOpen} onClick={() => { onClose(); nav(`/s/${sf.merchant.slug}/checkout`); }}>
            {sf.merchant.isOpen ? t('sf.checkout') : t('sf.closedNow')}
          </Button>
        </div>
      ) : undefined}>
      {!mine ? (
        <EmptyState icon="cart" title={t('sf.cartEmpty')}>{c && c.merchantId !== sf.merchant.id ? t('sf.otherStoreCart', { slug: c.slug }) : t('sf.cartEmptyHint')}</EmptyState>
      ) : (
        <ul className="cart-lines">
          {mine.lines.map((l) => (
            <li key={l.key} className="cart-line">
              <div className="thumb">{l.imageUrl ? <img src={l.imageUrl} alt="" /> : null}</div>
              <div className="grow stack" style={{ ['--gap' as string]: '2px' }}>
                <span className="strong">{pick(l.nameEn, l.nameAr)}</span>
                {l.optionLabels.length ? <span className="text-xs muted">{l.optionLabels.map((o) => pick(o.nameEn, o.nameAr)).join(' · ')}</span> : null}
                {l.notes ? <span className="text-xs muted">“{l.notes}”</span> : null}
                <div className="row between">
                  <div className="qty" role="group" aria-label={t('options.quantity')}>
                    <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.decrease')} onClick={() => cart.setQuantity(l.key, l.quantity - 1)}>−</button>
                    <span className="qty__value">{num(l.quantity, 0)}</span>
                    <button type="button" className="btn btn--icon btn--sm" aria-label={t('options.increase')} onClick={() => cart.setQuantity(l.key, l.quantity + 1)}>+</button>
                  </div>
                  <span className="strong num">{money(l.unitPriceBaisa * l.quantity)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

export function StorefrontShell({ sf, children, onCart }: { sf: Storefront; children: ReactNode; onCart?: () => void }) {
  const { t, pick, toggleLang, lang, money } = useI18n();
  const c = useCart();
  const { me } = useConsumer();
  const count = c?.merchantId === sf.merchant.id ? cartCount(c) : 0;
  const m = sf.merchant;
  return (
    <div className="sf" style={brandStyle(m.brandColor, m.accentColor)}>
      <header className="sf-header">
        <Link to={`/s/${m.slug}`} className="sf-header__brand">
          <span className="sf-logo">{m.logoUrl ? <img src={m.logoUrl} alt="" /> : <span aria-hidden="true">{pick(m.nameEn, m.nameAr).slice(0, 1)}</span>}</span>
          <span className="strong truncate">{pick(m.nameEn, m.nameAr)}</span>
        </Link>
        <div className="row row-nowrap" style={{ ['--gap' as string]: '6px' }}>
          {me ? <span className="text-sm muted hide-sm ltr">{me.user.phone}</span> : null}
          <Button size="sm" variant="ghost" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{t('lang.switch')}</Button>
          {onCart ? (
            <button type="button" className="sf-cart-btn" onClick={onCart} aria-label={t('sf.openCart', { n: count })} data-testid="cart-button">
              <Icon name="cart" />
              <span className="hide-sm">{count ? money(cartSubtotal(c)) : t('sf.cart')}</span>
              {count ? <span className="sf-cart-btn__count">{count}</span> : null}
            </button>
          ) : null}
        </div>
      </header>
      {children}
      <footer className="sf-footer">
        <span>{t('sf.poweredBy')}</span>
        <img src="/brand/logo.svg" alt="Qabnah قبناه" height={22} />
      </footer>
    </div>
  );
}

export function StorefrontLayout() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const q = useStorefrontQuery(slug);
  const [cartOpen, setCartOpen] = useState(false);
  useDocumentTitle(q.data ? `${pick(q.data.merchant.nameEn, q.data.merchant.nameAr)} · ${t('app.name')}` : t('app.name'));
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404;
    return (
      <div className="auth-page">
        <div className="card auth-card">
          {notFound ? <EmptyState icon="store" title={t('sf.notFound')}>{t('sf.notFoundHint')}</EmptyState> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        </div>
      </div>
    );
  }
  return (
    <StorefrontShell sf={q.data} onCart={() => setCartOpen(true)}>
      <Outlet context={{ sf: q.data, openCart: () => setCartOpen(true) } satisfies StorefrontCtx} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} sf={q.data} />
    </StorefrontShell>
  );
}
