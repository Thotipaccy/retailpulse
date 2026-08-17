import type { UserRole } from '../types'
import { ROUTES } from './routes'

export interface NavItem {
  path: string
  label: string
  icon: string
  roles: UserRole[]
  mobileTab?: boolean
  badge?: boolean
}

/**
 * Sidebar navigation — role-based item counts:
 * - Administrator: 11 (includes Administration)
 * - Manager: 10
 * - Analyst: 8
 * - Viewer: 5 (read-only modules; no Products catalog management)
 */
export const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: 'LayoutDashboard', roles: ['administrator', 'manager', 'analyst', 'viewer'], mobileTab: true },
  { path: ROUTES.SELL, label: 'Record Sale', icon: 'ShoppingCart', roles: ['administrator', 'manager', 'analyst'], mobileTab: true },
  { path: ROUTES.OUTSTANDING_PAYMENTS, label: 'Outstanding Payments', icon: 'AlertCircle', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.AI_PREDICTIVE, label: 'AI Predictive', icon: 'Brain', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.SALES, label: 'Sales Analytics', icon: 'TrendingUp', roles: ['administrator', 'manager', 'analyst', 'viewer'], mobileTab: true },
  { path: ROUTES.INVENTORY, label: 'Inventory', icon: 'Package', roles: ['administrator', 'manager', 'analyst', 'viewer'], mobileTab: true },
  { path: ROUTES.PRODUCTS, label: 'Products', icon: 'ShoppingBag', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.CUSTOMERS, label: 'Customers', icon: 'Users', roles: ['administrator', 'manager', 'analyst', 'viewer'], mobileTab: true },
  { path: ROUTES.RECOMMENDATIONS, label: 'Recommendations', icon: 'Sparkles', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.DATA_COLLECTION, label: 'Data Collection', icon: 'Upload', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.REPORTS, label: 'Reporting', icon: 'FileText', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.ALERTS, label: 'Alerts', icon: 'Bell', roles: ['administrator', 'manager', 'analyst', 'viewer'], badge: true },
  { path: ROUTES.ADMIN, label: 'Administration', icon: 'Settings', roles: ['administrator'] },
]

export const MOBILE_MORE_ITEMS: NavItem[] = [
  { path: ROUTES.AI_PREDICTIVE, label: 'AI Predictive', icon: 'Brain', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.RECOMMENDATIONS, label: 'Recommendations', icon: 'Sparkles', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.DATA_COLLECTION, label: 'Data Collection', icon: 'Upload', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.REPORTS, label: 'Reporting', icon: 'FileText', roles: ['administrator', 'manager', 'analyst'] },
  { path: ROUTES.ALERTS, label: 'Alerts', icon: 'Bell', roles: ['administrator', 'manager', 'analyst', 'viewer'] },
  { path: ROUTES.ADMIN, label: 'Administration', icon: 'Settings', roles: ['administrator'] },
]

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

export function getPageTitle(pathname: string): string {
  const normalized = pathname.replace(/\/$/, '') || ROUTES.DASHBOARD
  if (normalized === ROUTES.CUSTOMERS_ALL) return 'Customer Management'
  if (pathname.startsWith('/dashboard/customers/') && normalized !== ROUTES.CUSTOMERS_ALL) return 'Customer Profile'
  const item = NAV_ITEMS.find((n) => normalized === n.path || normalized.startsWith(n.path + '/'))
  if (item) return item.label
  if (normalized === ROUTES.OUTSTANDING_PAYMENTS) return 'Outstanding Payments'
  if (normalized === ROUTES.PRODUCTS) return 'Products'
  if (normalized === ROUTES.PROFILE) return 'My Profile'
  return 'RetailPulse'
}

export function isNavActive(pathname: string, itemPath: string): boolean {
  if (itemPath === ROUTES.DASHBOARD) {
    return pathname === ROUTES.DASHBOARD || pathname === '/dashboard/'
  }
  return pathname === itemPath || pathname.startsWith(itemPath + '/')
}
