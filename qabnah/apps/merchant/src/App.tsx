import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useOptionalSession, RequireMerchant, MerchantSessionProvider } from './portal/session';
import { PortalLayout, firstAllowedPath } from './portal/PortalLayout';
import { Alert, Loading, useI18n } from '@qabnah/shared';

/** React.lazy for named exports (route-level code splitting). */
function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}
const LoginPage = lazyNamed(() => import('./portal/AuthPages'), 'LoginPage');
const NoStorePage = lazyNamed(() => import('./portal/AuthPages'), 'NoStorePage');
const RegisterPage = lazyNamed(() => import('./portal/AuthPages'), 'RegisterPage');
const OrdersBoard = lazyNamed(() => import('./portal/orders/OrdersBoard'), 'OrdersBoard');
const OrderHistory = lazyNamed(() => import('./portal/orders/OrderHistory'), 'OrderHistory');
const OrderPage = lazyNamed(() => import('./portal/orders/OrderPage'), 'OrderPage');
const BookDelivery = lazyNamed(() => import('./portal/BookDelivery'), 'BookDelivery');
const CatalogPage = lazyNamed(() => import('./portal/catalog/CatalogPage'), 'CatalogPage');
const ProductEditor = lazyNamed(() => import('./portal/catalog/ProductEditor'), 'ProductEditor');
const StorePage = lazyNamed(() => import('./portal/store/StorePage'), 'StorePage');
const PaymentLinksPage = lazyNamed(() => import('./portal/PaymentLinksPage'), 'PaymentLinksPage');
const WhatsAppPage = lazyNamed(() => import('./portal/WhatsAppPage'), 'WhatsAppPage');
const AnalyticsPage = lazyNamed(() => import('./portal/BusinessPages'), 'AnalyticsPage');
const DocumentsPage = lazyNamed(() => import('./portal/BusinessPages'), 'DocumentsPage');
const FinancePage = lazyNamed(() => import('./portal/BusinessPages'), 'FinancePage');
const StaffPage = lazyNamed(() => import('./portal/BusinessPages'), 'StaffPage');
const StorefrontLayout = lazyNamed(() => import('./storefront/StorefrontLayout'), 'StorefrontLayout');
const StorefrontPage = lazyNamed(() => import('./storefront/StorefrontPage'), 'StorefrontPage');
const CheckoutPage = lazyNamed(() => import('./storefront/CheckoutPage'), 'CheckoutPage');
const OrderStatusPage = lazyNamed(() => import('./storefront/OrderStatusPage'), 'OrderStatusPage');
const StoresDirectory = lazyNamed(() => import('./storefront/StoresDirectory'), 'StoresDirectory');
const PayPage = lazyNamed(() => import('./pay/PayPage'), 'PayPage');
const AccountPage = lazyNamed(() => import('./storefront/AccountPage'), 'AccountPage');
const SecurityPage = lazyNamed(() => import('./portal/SecurityPage'), 'SecurityPage');


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
    <Suspense fallback={<Loading />}>
    <Routes>
      {/* Public: storefront and pay page (consumer session, independent from staff session) */}
      <Route path="/s/:slug" element={<StorefrontLayout />}>
        <Route index element={<StorefrontPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="orders/:id" element={<OrderStatusPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="/pay/:code" element={<PayPage />} />
      <Route path="/stores" element={<StoresDirectory />} />

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
          <Route path="/security" element={<SecurityPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

function PortalRoutesOutlet() { return <Outlet />; }
