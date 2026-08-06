import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { alertApi } from '../../services/alertApi'
import { ROUTES } from '../../config/routes'
import { GlassCard } from '../ui/GlassCard'
import { AvatarDropdown } from '../ui/AvatarDropdown'
import { GlobalSearch } from '../search/GlobalSearch'
import { formatRelativeTime } from '../../utils/format'
import type { Alert } from '../../types'

interface HeaderProps {
  onMenuClick: () => void
}

const ROLE_STYLES: Record<string, string> = {
  administrator: 'bg-rust/20 text-rust-light border-rust/30',
  manager: 'bg-steel/20 text-steel-light border-steel/30',
  analyst: 'bg-forest/20 text-forest-light border-forest/30',
  viewer: 'bg-white/10 text-on-glass-muted border-white/20',
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchAlerts = () => {
      alertApi.getAlerts().then((alerts) => {
        setNotifications(alerts.slice(0, 8))
        setUnreadCount(alerts.filter((a) => !a.isRead).length)
      }).catch(() => {})
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60_000)
    return () => clearInterval(interval)
  }, [])

  const roleStyle = ROLE_STYLES[user?.role ?? 'viewer'] ?? ROLE_STYLES.viewer

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/10 glass-subtle px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-on-glass hover:glass md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className={`hidden rounded-full border px-2.5 py-1 text-xs font-medium capitalize sm:inline ${roleStyle}`}>
            {user.role}
          </span>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-on-glass transition-colors hover:glass"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notifOpen ? ('true' as const) : ('false' as const)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ochre" aria-hidden="true" />
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} aria-hidden="true" />
              <GlassCard strong className="absolute right-0 z-20 mt-2 w-80 overflow-hidden p-0">
                <div className="border-b border-white/10 px-4 py-3">
                  <h3 className="text-sm font-semibold text-on-glass">Notifications</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-on-glass-muted">No notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.alertId}
                        type="button"
                        onClick={() => { navigate(ROUTES.ALERTS); setNotifOpen(false) }}
                        className="flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5"
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.severity === 'critical' ? 'bg-[#C2410C]' : n.severity === 'high' ? 'bg-[#C9952A]' : 'bg-[#5A7289]'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-on-glass">{n.alertType}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-on-glass-muted">{n.message}</p>
                          <p className="mt-1 text-[10px] text-on-glass-subtle">{formatRelativeTime(n.createdAt)}</p>
                        </div>
                        {!n.isRead && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
                        )}
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-white/10 p-3">
                  <button
                    type="button"
                    onClick={() => { navigate(ROUTES.ALERTS); setNotifOpen(false) }}
                    className="w-full rounded-lg py-2 text-center text-sm font-medium text-copper-light transition-colors hover:bg-white/5"
                  >
                    View All Notifications
                  </button>
                </div>
              </GlassCard>
            </>
          )}
        </div>

        <AvatarDropdown />
      </div>
    </header>
  )
}
