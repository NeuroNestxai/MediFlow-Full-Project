import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Icon, LiveIndicator, Loading, Photo, Select, Switch, errorMessage, useI18n, useRealtimeStatus, useToast, type MerchantDetail } from '@qabnah/shared';
import { merchantApi, merchantRealtime } from '../api';
import { merchantKey, useSession } from './session';

export const NAV: { to: string; icon: string; label: string; perm: string; end?: boolean; group: 'ops' | 'store' | 'business' }[] = [
  { to: '/orders', icon: 'orders', label: 'nav.board', perm: 'merchant.orders:read', end: true, group: 'ops' },
  { to: '/orders/history', icon: 'history', label: 'nav.history', perm: 'merchant.orders:read', group: 'ops' },
  { to: '/deliveries/new', icon: 'truck', label: 'nav.bookDelivery', perm: 'merchant.deliveries:create', group: 'ops' },
  { to: '/payment-links', icon: 'link', label: 'nav.paymentLinks', perm: 'merchant.payment_links:manage', group: 'ops' },
  { to: '/catalog', icon: 'box', label: 'nav.catalog', perm: 'merchant.store:read', group: 'store' },
  { to: '/store', icon: 'store', label: 'nav.storefront', perm: 'merchant.store:read', group: 'store' },
  { to: '/whatsapp', icon: 'chat', label: 'nav.whatsapp', perm: 'merchant.store:read', group: 'store' },
  { to: '/finance', icon: 'wallet', label: 'nav.finance', perm: 'merchant.finance:read', group: 'business' },
  { to: '/analytics', icon: 'chart', label: 'nav.analytics', perm: 'merchant.analytics:read', group: 'business' },
  { to: '/staff', icon: 'users', label: 'nav.staff', perm: 'merchant.store:read', group: 'business' },
  { to: '/documents', icon: 'file', label: 'nav.documents', perm: 'merchant.store:read', group: 'business' },
];

const TAB_ITEMS = ['/orders', '/catalog', '/deliveries/new', '/payment-links', '/store'];

export function firstAllowedPath(perms: string[]) {
  return NAV.find((n) => perms.includes(n.perm))?.to ?? '/store';
}

function StoreOpenToggle({ detail }: { detail: MerchantDetail }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (isOpen: boolean) => merchantApi.patch<MerchantDetail>(`/merchants/${detail.id}`, { isOpen }),
    onSuccess: (d) => { qc.setQueryData(merchantKey(detail.id), d); toast.push(d.storeToggleOpen ? t('store.nowOpen') : t('store.nowClosed')); },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  return (
    <div className="row" style={{ ['--gap' as string]: '8px' }}>
      <Switch checked={detail.storeToggleOpen} disabled={m.isPending} onChange={(v) => m.mutate(v)}
        label={detail.storeToggleOpen ? t('store.toggleOpen') : t('store.toggleClosed')} />
      {detail.storeToggleOpen && !detail.isOpen && detail.status === 'active' ? <Badge tone="warning">{t('store.outsideHours')}</Badge> : null}
    </div>
  );
}

export function PortalLayout() {
  const { t, pick, toggleLang, lang } = useI18n();
  const s = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const status = useRealtimeStatus(merchantRealtime);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = NAV.filter((n) => s.can(n.perm));
  const groups: ('ops' | 'store' | 'business')[] = ['ops', 'store', 'business'];
  const detail = s.detail;
  const pending = s.merchant && s.merchant.status !== 'active';

  return (
    <div className="app-shell app-shell--tabs">
      <div className={`mobile-nav-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label={t('common.menu')}>
        <a className="sidebar__brand" href="/orders" onClick={(e) => { e.preventDefault(); nav('/orders'); }}>
          <img src="/brand/mark.svg" alt="" />
          <span className="stack" style={{ ['--gap' as string]: '0px' }}>
            <span className="sidebar__brand-name">{t('app.name')}</span>
            <span className="sidebar__brand-sub">{t('portal.subtitle')}</span>
          </span>
        </a>
        {s.merchant ? (
          <div className="sidebar__store">
            <Photo src={detail?.logoUrl ?? detail?.coverUrl} ratio="1 / 1" category={detail?.category} className="photo--sm" style={{ width: 40 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="strong truncate" style={{ color: '#fff' }}>{pick(s.merchant.nameEn, s.merchant.nameAr)}</div>
              <div className="text-xs muted ltr truncate">/{s.merchant.slug}</div>
            </div>
          </div>
        ) : null}
        {s.merchants.length > 1 ? (
          <Select label={t('portal.store')} value={s.merchantId ?? ''} onChange={(e) => s.setMerchantId(e.target.value)}
            options={s.merchants.map((m) => ({ value: m.id, label: pick(m.nameEn, m.nameAr) }))} />
        ) : null}
        {groups.map((g) => {
          const gi = items.filter((i) => i.group === g);
          if (!gi.length) return null;
          return (
            <nav key={g} aria-label={t(`nav.group.${g}`)}>
              <div className="sidebar__section">{t(`nav.group.${g}`)}</div>
              {gi.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">
                  <Icon name={i.icon} />
                  <span>{t(i.label)}</span>
                </NavLink>
              ))}
            </nav>
          );
        })}
        <div className="sidebar__footer">
          <div className="sidebar__user text-sm">
            <div className="strong truncate" style={{ color: '#fff' }}>{s.me.user.fullName}</div>
            <div className="text-xs muted truncate ltr">{s.me.user.email}</div>
          </div>
          <NavLink to="/security" className="nav-link"><Icon name="key" /><span>{t('nav.security')}</span>{s.me.user.mfaEnabled ? <span className="badge badge--success">{t('mfa.on')}</span> : null}</NavLink>
          <Button variant="ghost" icon="logout" onClick={async () => { await s.signOut(); nav('/login'); }}>{t('common.signOut')}</Button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button className="topbar__menu" variant="ghost" iconOnly icon="menu" aria-label={t('common.menu')} aria-expanded={open} onClick={() => setOpen(true)} />
          {detail && s.can('merchant.store:manage') ? <StoreOpenToggle detail={detail} /> : detail ? <Badge tone={detail.isOpen ? 'success' : 'neutral'} dot>{detail.isOpen ? t('store.open') : t('store.closed')}</Badge> : null}
          <div className="grow" />
          <LiveIndicator status={status} />
          {s.merchant ? <a className="btn btn--ghost btn--sm" href={`/s/${s.merchant.slug}`} target="_blank" rel="noopener noreferrer"><Icon name="external" /><span className="hide-sm">{t('store.viewStorefront')}</span></a> : null}
          <Button size="sm" variant="ghost" icon="globe" onClick={toggleLang} aria-label={t('lang.switchLabel')} lang={lang === 'ar' ? 'en' : 'ar'}>{t('lang.switch')}</Button>
        </header>
        <main className="content" id="main">
          {pending ? (
            <Alert tone="warning" title={t('portal.pendingTitle')}>
              {s.merchant?.status === 'pending_review' ? t('portal.pendingBody') : t('portal.statusBody', { status: t(`merchant.status.${s.merchant?.status}`) })}
              {detail?.rejectionReason ? <div className="text-sm">{t('portal.reason')}: {detail.rejectionReason}</div> : null}
            </Alert>
          ) : null}
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </main>
      </div>
      <nav className="tabbar" aria-label={t('common.menu')}>
        {items.filter((i) => TAB_ITEMS.includes(i.to)).slice(0, 4).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="tabbar__item"><Icon name={i.icon} /><span className="truncate">{t(i.label)}</span></NavLink>
        ))}
        <button type="button" className="tabbar__item" onClick={() => setOpen(true)} aria-expanded={open}><Icon name="more" /><span>{t('nav.more')}</span></button>
      </nav>
    </div>
  );
}
