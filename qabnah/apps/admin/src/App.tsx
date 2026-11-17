import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Alert, Loading, useI18n } from '@qabnah/shared';

/** React.lazy for named exports (route-level code splitting). */
function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}
const OpsPage = lazyNamed(() => import('./pages/OpsPage'), 'OpsPage');
const OrderDetailPage = lazyNamed(() => import('./pages/OrdersPages'), 'OrderDetailPage');
const OrdersPage = lazyNamed(() => import('./pages/OrdersPages'), 'OrdersPage');
const MerchantDetailPage = lazyNamed(() => import('./pages/MerchantsPages'), 'MerchantDetailPage');
const MerchantsPage = lazyNamed(() => import('./pages/MerchantsPages'), 'MerchantsPage');
const CaptainDetailPage = lazyNamed(() => import('./pages/CaptainsPages'), 'CaptainDetailPage');
const CaptainsPage = lazyNamed(() => import('./pages/CaptainsPages'), 'CaptainsPage');
const FleetPartnersPage = lazyNamed(() => import('./pages/CaptainsPages'), 'FleetPartnersPage');
const DispatchPage = lazyNamed(() => import('./pages/ConfigPages'), 'DispatchPage');
const PlansPage = lazyNamed(() => import('./pages/ConfigPages'), 'PlansPage');
const PricingPage = lazyNamed(() => import('./pages/ConfigPages'), 'PricingPage');
const SettingsPage = lazyNamed(() => import('./pages/ConfigPages'), 'SettingsPage');
const ZonesPage = lazyNamed(() => import('./pages/ConfigPages'), 'ZonesPage');
const AnalyticsPage = lazyNamed(() => import('./pages/BusinessPages'), 'AnalyticsPage');
const FinancePage = lazyNamed(() => import('./pages/BusinessPages'), 'FinancePage');
const SupportPage = lazyNamed(() => import('./pages/BusinessPages'), 'SupportPage');
const TicketPage = lazyNamed(() => import('./pages/BusinessPages'), 'TicketPage');
const AuditPage = lazyNamed(() => import('./pages/AccessPages'), 'AuditPage');
const StaffPage = lazyNamed(() => import('./pages/AccessPages'), 'StaffPage');
const UsersPage = lazyNamed(() => import('./pages/AccessPages'), 'UsersPage');

import { Layout, firstAllowed } from './Layout';
import { RequireStaff, useOptionalSession } from './session';
import { LoginPage } from './pages/LoginPage';
import { MfaGate, MfaSetupPage, SecurityPage } from './pages/SecurityPages';

function Guard({ perms, children }: { perms: string[]; children: ReactNode }) {
  const s = useOptionalSession();
  const { t } = useI18n();
  if (!s?.can(...perms)) return <Alert tone="warning" title={t('common.noPermission')} />;
  return <>{children}</>;
}

function Home() {
  const s = useOptionalSession();
  return <Navigate to={s ? firstAllowed(s.perms) : '/login'} replace />;
}

function NoAccess() {
  const { t } = useI18n();
  const s = useOptionalSession();
  return <div className="auth-page"><div className="card auth-card pad stack"><h1>{t('noAccess.title')}</h1><p className="muted">{t('noAccess.body')}</p>{s ? <button className="btn" onClick={() => s.signOut()}>{t('common.signOut')}</button> : null}</div></div>;
}

const g = (perms: string[], el: ReactNode) => <Guard perms={perms}>{el}</Guard>;

export function App() {
  return (
    <>
    <MfaGate />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/security/setup" element={<RequireStaff><MfaSetupPage /></RequireStaff>} />
      <Route path="/no-access" element={<NoAccess />} />
      <Route path="/" element={<Home />} />
      <Route element={<RequireStaff><Layout /></RequireStaff>}>
        <Route path="/ops" element={g(['deliveries:read'], <OpsPage />)} />
        <Route path="/orders" element={g(['orders:read'], <OrdersPage />)} />
        <Route path="/orders/:id" element={g(['orders:read'], <OrderDetailPage />)} />
        <Route path="/merchants" element={g(['merchants:read'], <MerchantsPage />)} />
        <Route path="/merchants/:id" element={g(['merchants:read'], <MerchantDetailPage />)} />
        <Route path="/captains" element={g(['captains:read'], <CaptainsPage />)} />
        <Route path="/captains/:id" element={g(['captains:read'], <CaptainDetailPage />)} />
        <Route path="/fleet-partners" element={g(['captains:read'], <FleetPartnersPage />)} />
        <Route path="/config/zones" element={g(['deliveries:read', 'zones:manage'], <ZonesPage />)} />
        <Route path="/config/pricing" element={g(['pricing:manage', 'deliveries:read'], <PricingPage />)} />
        <Route path="/config/dispatch" element={g(['dispatch_rules:manage', 'deliveries:read'], <DispatchPage />)} />
        <Route path="/config/settings" element={g(['settings:manage', 'finance:read', 'deliveries:read'], <SettingsPage />)} />
        <Route path="/config/plans" element={g(['plans:manage', 'merchants:read'], <PlansPage />)} />
        <Route path="/finance" element={g(['finance:read'], <FinancePage />)} />
        <Route path="/support" element={g(['support:read'], <SupportPage />)} />
        <Route path="/support/:id" element={g(['support:read'], <TicketPage />)} />
        <Route path="/analytics" element={g(['analytics:read'], <AnalyticsPage />)} />
        <Route path="/users" element={g(['users:read'], <UsersPage />)} />
        <Route path="/staff" element={g(['staff:manage', 'users:read'], <StaffPage />)} />
        <Route path="/audit" element={g(['audit:read'], <AuditPage />)} />
        <Route path="/security" element={<SecurityPage />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
    </Suspense>
    </>
  );
}
