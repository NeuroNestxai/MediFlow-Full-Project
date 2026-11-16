import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Alert, useI18n } from '@qabnah/shared';
import { Layout, firstAllowed } from './Layout';
import { RequireStaff, useOptionalSession } from './session';
import { LoginPage } from './pages/LoginPage';
import { OpsPage } from './pages/OpsPage';
import { OrderDetailPage, OrdersPage } from './pages/OrdersPages';
import { MerchantDetailPage, MerchantsPage } from './pages/MerchantsPages';
import { CaptainDetailPage, CaptainsPage, FleetPartnersPage } from './pages/CaptainsPages';
import { DispatchPage, PlansPage, PricingPage, SettingsPage, ZonesPage } from './pages/ConfigPages';
import { AnalyticsPage, FinancePage, SupportPage, TicketPage } from './pages/BusinessPages';
import { AuditPage, StaffPage, UsersPage } from './pages/AccessPages';

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
