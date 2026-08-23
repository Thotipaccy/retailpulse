import { lazy, Suspense, useEffect } from 'react'
import type { LazyExoticComponent, ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { CardSkeleton } from './components/ui/PageHeader'
import { LEGACY_REDIRECTS, ROUTES } from './config/routes'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'

/**
 * Route-level code splitting with named loaders so frequently visited pages
 * can be prefetched during browser idle time, making navigation effectively
 * instant after first load.
 */
const loaders = {
  DashboardPage: () => import('./pages/DashboardPage'),
  RecordSalePage: () => import('./pages/RecordSalePage'),
  OutstandingPaymentsPage: () => import('./pages/OutstandingPaymentsPage'),
  DataCollectionPage: () => import('./pages/DataCollectionPage'),
  SalesAnalyticsPage: () => import('./pages/SalesAnalyticsPage'),
  InventoryAnalyticsPage: () => import('./pages/InventoryAnalyticsPage'),
  ProductManagementPage: () => import('./pages/ProductManagementPage'),
  ProductProfilePage: () => import('./pages/ProductProfilePage'),
  CustomerAnalyticsPage: () => import('./pages/CustomerAnalyticsPage'),
  CustomerManagementPage: () => import('./pages/CustomerManagementPage'),
  CustomerProfilePage: () => import('./pages/CustomerProfilePage'),
  AIPredictivePage: () => import('./pages/AIPredictivePage'),
  ProductRecommendationsPage: () => import('./pages/ProductRecommendationsPage'),
  ReportingPage: () => import('./pages/ReportingPage'),
  AlertsPage: () => import('./pages/AlertsPage'),
  AdminPage: () => import('./pages/AdminPage'),
  ProfilePage: () => import('./pages/ProfilePage'),
  TransactionHistoryPage: () => import('./pages/TransactionHistoryPage'),
} as const

type LoaderKey = keyof typeof loaders

function page(key: LoaderKey): LazyExoticComponent<ComponentType> {
  return lazy(() => loaders[key]().then((m) => ({ default: (m as unknown as Record<LoaderKey, ComponentType>)[key] })))
}

const DashboardPage = page('DashboardPage')
const RecordSalePage = page('RecordSalePage')
const OutstandingPaymentsPage = page('OutstandingPaymentsPage')
const DataCollectionPage = page('DataCollectionPage')
const SalesAnalyticsPage = page('SalesAnalyticsPage')
const InventoryAnalyticsPage = page('InventoryAnalyticsPage')
const ProductManagementPage = page('ProductManagementPage')
const ProductProfilePage = page('ProductProfilePage')
const CustomerAnalyticsPage = page('CustomerAnalyticsPage')
const CustomerManagementPage = page('CustomerManagementPage')
const CustomerProfilePage = page('CustomerProfilePage')
const AIPredictivePage = page('AIPredictivePage')
const ProductRecommendationsPage = page('ProductRecommendationsPage')
const ReportingPage = page('ReportingPage')
const AlertsPage = page('AlertsPage')
const AdminPage = page('AdminPage')
const ProfilePage = page('ProfilePage')
const TransactionHistoryPage = page('TransactionHistoryPage')

/** Pages staff open constantly — warmed during idle so first click renders instantly. */
const PREFETCH_KEYS: LoaderKey[] = [
  'DashboardPage',
  'RecordSalePage',
  'ProductManagementPage',
  'ProductProfilePage',
  'CustomerAnalyticsPage',
  'SalesAnalyticsPage',
  'InventoryAnalyticsPage',
  'TransactionHistoryPage',
  'AlertsPage',
]

function PageLoader() {
  return (
    <div className="py-8">
      <CardSkeleton count={4} />
    </div>
  )
}

function LegacyRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />
}

function RoutePrefetcher() {
  useEffect(() => {
    const warm = () => {
      PREFETCH_KEYS.forEach((key) => {
        void loaders[key]().catch(() => undefined)
      })
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    let scheduled: number | undefined
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(warm, { timeout: 3000 })
    } else {
      scheduled = window.setTimeout(warm, 1200)
    }
    return () => {
      if (scheduled !== undefined) window.clearTimeout(scheduled)
    }
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RoutePrefetcher />
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
          <Route path="sell" element={<Suspense fallback={<PageLoader />}><RecordSalePage /></Suspense>} />
          <Route path="outstanding-payments" element={<Suspense fallback={<PageLoader />}><OutstandingPaymentsPage /></Suspense>} />
          <Route path="ai-predictive" element={<Suspense fallback={<PageLoader />}><AIPredictivePage /></Suspense>} />
          <Route path="sales" element={<Suspense fallback={<PageLoader />}><SalesAnalyticsPage /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<PageLoader />}><InventoryAnalyticsPage /></Suspense>} />
          <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductManagementPage /></Suspense>} />
          <Route path="products/:id" element={<Suspense fallback={<PageLoader />}><ProductProfilePage /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<PageLoader />}><CustomerAnalyticsPage /></Suspense>} />
          <Route path="customers/all" element={<Suspense fallback={<PageLoader />}><CustomerManagementPage /></Suspense>} />
          <Route path="customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerProfilePage /></Suspense>} />
          <Route path="recommendations" element={<Suspense fallback={<PageLoader />}><ProductRecommendationsPage /></Suspense>} />
          <Route path="data-collection" element={<Suspense fallback={<PageLoader />}><DataCollectionPage /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportingPage /></Suspense>} />
          <Route path="transaction-history" element={<Suspense fallback={<PageLoader />}><TransactionHistoryPage /></Suspense>} />
          <Route path="alerts" element={<Suspense fallback={<PageLoader />}><AlertsPage /></Suspense>} />
          <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
          <Route
            path="admin"
            element={
              <ProtectedRoute roles={['administrator']}>
                <Suspense fallback={<PageLoader />}>
                  <AdminPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
        ))}

        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
