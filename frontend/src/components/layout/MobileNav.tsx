import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Bell,
  Brain,
  Compass,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Sparkles,
  Store,
  TrendingUp,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { MOBILE_MORE_ITEMS, NAV_ITEMS } from '../../config/navigation'
import { ROUTES } from '../../config/routes'
import { GlassCard } from '../ui/GlassCard'

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Brain,
  TrendingUp,
  Package,
  Users,
  Sparkles,
  Upload,
  FileText,
  Bell,
  Store,
  Compass,
  Settings,
}

const MOBILE_TABS = NAV_ITEMS.filter((item) => item.mobileTab)

export function MobileNav() {
  const { user } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  if (!user) return null

  const moreItems = MOBILE_MORE_ITEMS.filter((item) => item.roles.includes(user.role))
  const isMoreActive = moreItems.some((item) => location.pathname === item.path)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 glass-sidebar border-t border-white/12 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around">
          {MOBILE_TABS.filter((item) => item.roles.includes(user.role)).map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === ROUTES.DASHBOARD}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                    isActive ? 'text-copper-light' : 'text-on-glass-muted'
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label.split(' ')[0]}
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              isMoreActive ? 'text-copper-light' : 'text-on-glass-muted'
            }`}
            aria-label="More navigation options"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-charcoal-900/70 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <GlassCard strong className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-b-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-on-glass">More</h3>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1 text-on-glass-muted hover:text-on-glass" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const Icon = iconMap[item.icon] ?? LayoutDashboard
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl border p-3 text-sm font-medium ${
                        isActive
                          ? 'border-copper/40 bg-copper/15 text-copper-light'
                          : 'border-white/12 text-on-glass-muted hover:bg-white/5 hover:text-on-glass'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          </GlassCard>
        </div>
      )}
    </>
  )
}
