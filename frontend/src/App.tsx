import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { CardSkeleton } from './components/ui/PageHeader'
import { LEGACY_REDIRECTS, ROUTES } from './config/routes'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const DataCollectionPage = lazy(() => import('./pages/DataCollectionPage').then((m) => ({ default: m.DataCollectionPage })))
const SalesAnalyticsPage = lazy(() => import('./pages/SalesAnalyticsPage').then((m) => ({ default: m.SalesAnalyticsPage })))
const InventoryAnalyticsPage = lazy(() => import('./pages/InventoryAnalyticsPage').then((m) => ({ default: m.InventoryAnalyticsPage })))
const ProductManagementPage = lazy(() => import('./pages/ProductManagementPage').then((m) => ({ default: m.ProductManagementPage })))
const CustomerAnalyticsPage = lazy(() => import('./pages/CustomerAnalyticsPage').then((m) => ({ default: m.CustomerAnalyticsPage })))
const CustomerManagementPage = lazy(() => import('./pages/CustomerManagementPage').then((m) => ({ default: m.CustomerManagementPage })))
const CustomerProfilePage = lazy(() => import('./pages/CustomerProfilePage').then((m) => ({ default: m.CustomerProfilePage })))
const AIPredictivePage = lazy(() => import('./pages/AIPredictivePage').then((m) => ({ default: m.AIPredictivePage })))
const ProductRecommendationsPage = lazy(() => import('./pages/ProductRecommendationsPage').then((m) => ({ default: m.ProductRecommendationsPage })))
const ReportingPage = lazy(() => import('./pages/ReportingPage').then((m) => ({ default: m.ReportingPage })))
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))

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

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="ai-predictive" element={<Suspense fallback={<PageLoader />}><AIPredictivePage /></Suspense>} />
          <Route path="sales" element={<Suspense fallback={<PageLoader />}><SalesAnalyticsPage /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<PageLoader />}><InventoryAnalyticsPage /></Suspense>} />
          <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductManagementPage /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<PageLoader />}><CustomerAnalyticsPage /></Suspense>} />
          <Route path="customers/all" element={<Suspense fallback={<PageLoader />}><CustomerManagementPage /></Suspense>} />
          <Route path="customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerProfilePage /></Suspense>} />
          <Route path="recommendations" element={<Suspense fallback={<PageLoader />}><ProductRecommendationsPage /></Suspense>} />
          <Route path="data-collection" element={<Suspense fallback={<PageLoader />}><DataCollectionPage /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportingPage /></Suspense>} />
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
