import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useOptionalSession, RequireMerchant, MerchantSessionProvider } from './portal/session';
import { PortalLayout, firstAllowedPath } from './portal/PortalLayout';
import { LoginPage, NoStorePage, RegisterPage } from './portal/AuthPages';
import { OrdersBoard } from './portal/orders/OrdersBoard';
import { OrderHistory } from './portal/orders/OrderHistory';
import { OrderPage } from './portal/orders/OrderPage';
import { BookDelivery } from './portal/BookDelivery';
import { CatalogPage } from './portal/catalog/CatalogPage';
import { ProductEditor } from './portal/catalog/ProductEditor';
import { StorePage } from './portal/store/StorePage';
import { PaymentLinksPage } from './portal/PaymentLinksPage';
import { WhatsAppPage } from './portal/WhatsAppPage';
import { AnalyticsPage, DocumentsPage, FinancePage, StaffPage } from './portal/BusinessPages';
import { StorefrontLayout } from './storefront/StorefrontLayout';
import { StorefrontPage } from './storefront/StorefrontPage';
import { CheckoutPage } from './storefront/CheckoutPage';
import { OrderStatusPage } from './storefront/OrderStatusPage';
import { PayPage } from './pay/PayPage';
import { Alert, useI18n } from '@qabnah/shared';
import type { ReactNode } from 'react';

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const s = useOptionalSession();
  const { t } = useI18n();
  if (!s?.can(perm)) return <Alert tone="warning" title={t('common.noPermission')} />;
  return <>{children}</>;
}

function Home() {
  const s = useOptionalSession();
  if (!s) return <Navigate to="/login" replace />;
  return <Navigate to={firstAllowedPath(s.perms)} replace />;
}

function NotFound() {
  const { t } = useI18n();
  return <div className="auth-page"><div className="card auth-card pad stack"><h1>404</h1><p className="muted">{t('notFound.body')}</p><a className="btn btn--primary" href="/">{t('notFound.home')}</a></div></div>;
}

export function App() {
  return (
    <Routes>
      {/* Public: storefront and pay page (consumer session, independent from staff session) */}
      <Route path="/s/:slug" element={<StorefrontLayout />}>
        <Route index element={<StorefrontPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="orders/:id" element={<OrderStatusPage />} />
      </Route>
      <Route path="/pay/:code" element={<PayPage />} />

      {/* Merchant portal */}
      <Route element={<MerchantSessionProvider><PortalRoutesOutlet /></MerchantSessionProvider>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/no-store" element={<NoStorePage />} />
        <Route path="/" element={<Home />} />
        <Route element={<RequireMerchant><PortalLayout /></RequireMerchant>}>
          <Route path="/orders" element={<Guard perm="merchant.orders:read"><OrdersBoard /></Guard>} />
          <Route path="/orders/history" element={<Guard perm="merchant.orders:read"><OrderHistory /></Guard>} />
          <Route path="/orders/:id" element={<Guard perm="merchant.orders:read"><OrderPage /></Guard>} />
          <Route path="/deliveries/new" element={<Guard perm="merchant.deliveries:create"><BookDelivery /></Guard>} />
          <Route path="/catalog" element={<Guard perm="merchant.store:read"><CatalogPage /></Guard>} />
          <Route path="/catalog/products/:id" element={<Guard perm="merchant.store:read"><ProductEditor /></Guard>} />
          <Route path="/store" element={<Guard perm="merchant.store:read"><StorePage /></Guard>} />
          <Route path="/payment-links" element={<Guard perm="merchant.payment_links:manage"><PaymentLinksPage /></Guard>} />
          <Route path="/whatsapp" element={<Guard perm="merchant.store:read"><WhatsAppPage /></Guard>} />
          <Route path="/finance" element={<Guard perm="merchant.finance:read"><FinancePage /></Guard>} />
          <Route path="/analytics" element={<Guard perm="merchant.analytics:read"><AnalyticsPage /></Guard>} />
          <Route path="/staff" element={<Guard perm="merchant.store:read"><StaffPage /></Guard>} />
          <Route path="/documents" element={<Guard perm="merchant.store:read"><DocumentsPage /></Guard>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function PortalRoutesOutlet() { return <Outlet />; }
