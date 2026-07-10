import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ROUTES } from '../../config/routes'
import { GlassCard } from './GlassCard'

export function AvatarDropdown() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSignOut = async () => {
    setOpen(false)
    await logout()
    navigate(ROUTES.LOGIN)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-[39px] w-[39px] items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-copper to-copper-dark text-sm font-semibold text-white transition-opacity hover:opacity-90"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {user?.avatarDataUrl ? (
          <img src={user.avatarDataUrl} alt={user.fullName} className="h-full w-full rounded-full object-cover" />
        ) : (
          user?.fullName.charAt(0) ?? 'U'
        )}
      </button>

      {open && (
        <GlassCard strong className="absolute right-0 z-50 mt-2 w-52 overflow-hidden p-0">
          <button
            type="button"
            onClick={() => { navigate(ROUTES.PROFILE); setOpen(false) }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-on-glass hover:bg-white/5"
          >
            <User className="h-4 w-4 text-on-glass-muted" />
            My Profile
          </button>
          <button
            type="button"
            onClick={() => { navigate(ROUTES.PROFILE_SECURITY); setOpen(false) }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-on-glass hover:bg-white/5"
          >
            <Settings className="h-4 w-4 text-on-glass-muted" />
            Settings
          </button>
          <div className="border-t border-white/10" />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rust-light hover:bg-rust/10"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </GlassCard>
      )}
    </div>
  )
}
