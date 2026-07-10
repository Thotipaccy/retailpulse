import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from '../services/authApi'
import type { User, UserRole } from '../types'
import { addActivity } from '../utils/activityLog'
import { rememberDevice as persistRememberedDevice } from '../utils/security'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  initiateLogin: (email: string, password: string, rememberMe: boolean) => Promise<{ requires2FA: boolean; email?: string }>
  verify2FA: (code: string, rememberDevice: boolean) => Promise<void>
  resend2FACode: (email: string) => Promise<void>
  logout: () => Promise<void>
  updateUserAvatar: (avatarDataUrl?: string) => void
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authApi.getStoredUser())
  const [isLoading, setIsLoading] = useState(false)
  const inactivityTimer = useRef<number | null>(null)
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const restored = await authApi.tryRestoreSession()
      if (cancelled) return
      if (restored) {
        setUser(restored)
        return
      }
      if (!authApi.isAuthenticated()) return
      authApi.getProfile().then((profile) => {
        if (!cancelled) setUser(profile)
      }).catch(() => {
        if (!cancelled) {
          authApi.logout()
          setUser(null)
        }
      })
    }
    void restore()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!authApi.isAuthenticated()) return
    const resetInactivity = () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      inactivityTimer.current = window.setTimeout(() => {
        authApi.logout()
        setUser(null)
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
      }, SESSION_TIMEOUT_MS)
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, resetInactivity, { passive: true }))
    resetInactivity()
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, resetInactivity))
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
    }
  }, [user])

  const initiateLogin = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    setIsLoading(true)
    try {
      const result = await authApi.login(email, password, rememberMe)
      if (!result.requires2FA && result.user) {
        setUser(result.user)
        if (rememberMe) persistRememberedDevice(email, 30)
        addActivity('Login', 'Logged in from web dashboard')
        return { requires2FA: false, email }
      }

      return { requires2FA: result.requires2FA, email }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const verify2FA = useCallback(async (code: string, rememberDevice: boolean) => {
    setIsLoading(true)
    try {
      const result = await authApi.verify2FA(code, rememberDevice)
      if (result.user) {
        setUser(result.user)
        if (rememberDevice) persistRememberedDevice(result.user.email, 30)
        addActivity('Login', 'Two-factor verification completed')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resend2FACode = useCallback(async (_email: string) => {
    await authApi.resend2FA()
  }, [])

  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      authApi.logout()
      addActivity('Logout', 'Signed out from current session')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateUserAvatar = useCallback((avatarDataUrl?: string) => {
    setUser((prev) => {
      if (!prev) return prev
      return { ...prev, avatarDataUrl }
    })
  }, [])

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false
    return roles.includes(user.role)
  }, [user])

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user && authApi.isAuthenticated(), isLoading, initiateLogin, verify2FA, resend2FACode, logout, updateUserAvatar, hasRole }),
    [user, isLoading, initiateLogin, verify2FA, resend2FACode, logout, updateUserAvatar, hasRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export function getRoleRedirectPath(role: UserRole): string {
  switch (role) {
    case 'administrator': return '/dashboard/admin'
    case 'manager': return '/dashboard'
    case 'analyst': return '/dashboard/data-collection'
    case 'viewer': return '/dashboard'
    default: return '/dashboard'
  }
}
