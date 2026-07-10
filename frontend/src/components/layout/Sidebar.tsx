import { useEffect, useState } from 'react'
import {
  Bell, Brain, ChevronLeft, ChevronRight, Compass, FileText, LayoutDashboard,
  Package, Settings, ShoppingBag, Sparkles, Store, TrendingUp, Upload, Users,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getNavItemsForRole } from '../../config/navigation'
import { ROUTES } from '../../config/routes'
import { alertApi } from '../../services/alertApi'

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Brain, TrendingUp, Package, ShoppingBag, Users, Sparkles, Upload,
  FileText, Bell, Store, Compass, Settings,
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user } = useAuth()
  const navItems = user ? getNavItemsForRole(user.role) : []
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  useEffect(() => {
    alertApi.getAlerts('unread').then((a) => setUnreadAlerts(a.length)).catch(() => {})
  }, [])

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-charcoal-900/60 backdrop-blur-sm md:hidden" onClick={onMobileClose} aria-hidden="true" />
      )}

      <aside
        className={`glass-sidebar fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-white/10 transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${collapsed ? 'w-20' : 'w-[260px]'}`}
      >
        {/* Logo — sticky top */}
        <div className={`sticky top-0 z-10 flex h-16 shrink-0 items-center border-b border-white/10 bg-charcoal-900/40 px-4 backdrop-blur-md ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-copper to-copper-dark">
                <Store className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              <span className="truncate font-semibold text-on-glass">RetailPulse</span>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-glass-muted transition-colors hover:bg-white/5 hover:text-on-glass md:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav — scrolls independently */}
        <nav className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-6" aria-label="Main navigation">
          <div className="space-y-2">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon] ?? LayoutDashboard
              const showBadge = item.badge && unreadAlerts > 0
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === ROUTES.DASHBOARD}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                      isActive
                        ? 'bg-copper/20 text-copper-light'
                        : 'text-on-glass-muted hover:bg-white/5 hover:text-on-glass'
                    } ${collapsed ? 'justify-center px-2' : ''}`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-copper-light" aria-hidden="true" />
                      )}
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {!collapsed && (
                        <>
                          <span className="truncate text-sm font-medium">{item.label}</span>
                          {showBadge && (
                            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rust/80 px-1.5 text-[10px] font-bold text-white">
                              {unreadAlerts > 9 ? '9+' : unreadAlerts}
                            </span>
                          )}
                        </>
                      )}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* User — sticky bottom, no logout */}
        <div className="sticky bottom-0 shrink-0 border-t border-white/10 bg-charcoal-900/40 p-4 backdrop-blur-md">
          {collapsed ? (
            <div className="flex justify-center">
              <div
                className="flex h-[39px] w-[39px] items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-copper to-copper-dark text-sm font-semibold text-white"
                title={user?.fullName}
              >
                {user?.avatarDataUrl ? (
                  <img src={user.avatarDataUrl} alt={user.fullName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  user?.fullName.charAt(0) ?? 'U'
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-[39px] w-[39px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-copper to-copper-dark text-sm font-semibold text-white">
                {user?.avatarDataUrl ? (
                  <img src={user.avatarDataUrl} alt={user.fullName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  user?.fullName.charAt(0) ?? 'U'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-on-glass">{user?.fullName}</p>
                <p className="truncate text-xs capitalize text-on-glass-muted">{user?.role}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
