import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon, LiveIndicator, Loading, useI18n, useRealtimeStatus } from '@qabnah/shared';
import { realtime } from './api';
import { useSession } from './session';

export const NAV: { to: string; icon: string; label: string; perms: string[]; group: string }[] = [
  { to: '/ops', icon: 'map', label: 'nav.ops', perms: ['deliveries:read'], group: 'operations' },
  { to: '/orders', icon: 'orders', label: 'nav.orders', perms: ['orders:read'], group: 'operations' },
  { to: '/support', icon: 'support', label: 'nav.support', perms: ['support:read'], group: 'operations' },
  { to: '/merchants', icon: 'store', label: 'nav.merchants', perms: ['merchants:read'], group: 'network' },
  { to: '/captains', icon: 'bike', label: 'nav.captains', perms: ['captains:read'], group: 'network' },
  { to: '/fleet-partners', icon: 'truck', label: 'nav.fleet', perms: ['captains:read'], group: 'network' },
  { to: '/finance', icon: 'wallet', label: 'nav.finance', perms: ['finance:read'], group: 'business' },
  { to: '/analytics', icon: 'chart', label: 'nav.analytics', perms: ['analytics:read'], group: 'business' },
  { to: '/config/zones', icon: 'pin', label: 'nav.zones', perms: ['deliveries:read', 'zones:manage'], group: 'config' },
  { to: '/config/pricing', icon: 'wallet', label: 'nav.pricing', perms: ['pricing:manage', 'deliveries:read'], group: 'config' },
  { to: '/config/dispatch', icon: 'settings', label: 'nav.dispatch', perms: ['dispatch_rules:manage', 'deliveries:read'], group: 'config' },
  { to: '/config/settings', icon: 'settings', label: 'nav.settings', perms: ['settings:manage', 'finance:read', 'deliveries:read'], group: 'config' },
  { to: '/config/plans', icon: 'list', label: 'nav.plans', perms: ['plans:manage', 'merchants:read'], group: 'config' },
  { to: '/users', icon: 'users', label: 'nav.users', perms: ['users:read'], group: 'access' },
  { to: '/staff', icon: 'shield', label: 'nav.staff', perms: ['staff:manage', 'users:read'], group: 'access' },
  { to: '/audit', icon: 'history', label: 'nav.audit', perms: ['audit:read'], group: 'access' },
];
export const firstAllowed = (perms: string[]) => NAV.find((n) => n.perms.some((p) => perms.includes(p)))?.to ?? '/no-access';

export function Layout() {
  const { t, toggleLang, lang } = useI18n();
  const s = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const status = useRealtimeStatus(realtime);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = NAV.filter((n) => s.can(...n.perms));
  const groups = [...new Set(items.map((i) => i.group))];
  const roles = s.me.roles.filter((r) => !r.merchantId).map((r) => t(`role.${r.key}`)).join(', ');
  const full = loc.pathname === '/ops';
  return (
    <div className="app-shell">
      <div className={`mobile-nav-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label={t('common.menu')}>
        <a className="sidebar__brand" href="/" onClick={(e) => { e.preventDefault(); nav('/'); }}>
          <img src="/brand/mark.svg" alt="" />
          <span className="stack" style={{ ['--gap' as string]: '0px' }}>
            <span className="sidebar__brand-name">{t('app.name')}</span>
            <span className="sidebar__brand-sub">{t('admin.subtitle')}</span>
          </span>
        </a>
        {groups.map((g) => (
          <nav key={g} aria-label={t(`nav.group.${g}`)}>
            <div className="sidebar__section">{t(`nav.group.${g}`)}</div>
            {items.filter((i) => i.group === g).map((i) => (
              <NavLink key={i.to} to={i.to} className="nav-link"><Icon name={i.icon} /><span>{t(i.label)}</span></NavLink>
            ))}
          </nav>
        ))}
        <div className="sidebar__footer">
          <div className="text-sm">
            <div className="strong truncate">{s.me.user.fullName}</div>
            <div className="text-xs muted truncate">{roles}</div>
          </div>
          <NavLink to="/security" className="nav-link"><Icon name="key" /><span>{t('nav.security')}</span>{!s.me.user.mfaEnabled ? <span className="badge badge--warning">{t('mfa.off')}</span> : null}</NavLink>
          <Button variant="ghost" icon="logout" onClick={async () => { await s.signOut(); nav('/login'); }}>{t('common.signOut')}</Button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button className="topbar__menu" variant="ghost" iconOnly icon="menu" aria-label={t('common.menu')} aria-expanded={open} onClick={() => setOpen(true)} />
          <span className="strong">{t(NAV.find((n) => loc.pathname.startsWith(n.to))?.label ?? (loc.pathname === '/security' ? 'nav.security' : 'admin.subtitle'))}</span>
          <div className="grow" />
          <LiveIndicator status={status} />
          <Button size="sm" variant="ghost" icon="globe" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{t('lang.switch')}</Button>
        </header>
        <main className={`content ${full ? 'content--full' : ''}`} id="main"><Suspense fallback={<Loading />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
