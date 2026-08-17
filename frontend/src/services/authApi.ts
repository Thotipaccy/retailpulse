import type { LoginResult, TokenResult } from '../types/api'
import type { User } from '../types'
import { getDeviceId } from '../utils/security'
import { api, unwrap } from './api'

const TOKEN_KEY = 'retailpulse_token'
const REFRESH_KEY = 'retailpulse_refresh_token'
const USER_KEY = 'retailpulse_user'
const TEMP_TOKEN_KEY = 'retailpulse_temp_token'
const AVATAR_KEY_PREFIX = 'retailpulse_avatar_'
const TWO_FA_KEY_PREFIX = 'retailpulse_2fa_'

export const authApi = {
  async login(email: string, password: string, rememberMe = false): Promise<LoginResult> {
    const { data } = await api.post('/auth/login', {
      email,
      password,
      rememberMe,
      deviceFingerprint: getDeviceId(),
    })
    const result = unwrap<LoginResult>({ data })
    if (result.requires2FA && result.tempToken) {
      sessionStorage.setItem(TEMP_TOKEN_KEY, result.tempToken)
    } else if (result.accessToken && result.user) {
      persistSession(result.accessToken, result.refreshToken, mapUser(result.user as unknown as Record<string, unknown>))
    }
    return result
  },

  async verify2FA(code: string, rememberDevice: boolean): Promise<LoginResult> {
    const tempToken = sessionStorage.getItem(TEMP_TOKEN_KEY)
    if (!tempToken) throw new Error('Session expired. Please login again.')
    const { data } = await api.post('/auth/verify-2fa', {
      tempToken,
      code,
      rememberDevice,
      deviceFingerprint: getDeviceId(),
    })
    const result = unwrap<LoginResult>({ data })
    if (result.accessToken && result.user) {
      persistSession(result.accessToken, result.refreshToken, mapUser(result.user as unknown as Record<string, unknown>))
      sessionStorage.removeItem(TEMP_TOKEN_KEY)
    }
    return result
  },

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const { data } = await api.post('/auth/refresh', {
      refreshToken,
      deviceFingerprint: getDeviceId(),
    })
    const result = unwrap<TokenResult>({ data })
    localStorage.setItem(TOKEN_KEY, result.accessToken)
    if (result.refreshToken) localStorage.setItem(REFRESH_KEY, result.refreshToken)
    return result
  },

  async getProfile(): Promise<User> {
    const { data } = await api.get('/users/profile')
    const profile = unwrap<Record<string, unknown>>({ data })
    const user = mapUser(profile)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  },

  async updateProfile(payload: { fullName: string; email: string; phone?: string; department?: string }): Promise<User> {
    const { data } = await api.put('/users/profile', payload)
    const profile = unwrap<Record<string, unknown>>({ data })
    const user = mapUser(profile)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  },

  async tryRestoreSession(): Promise<User | null> {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) return null
    try {
      await this.refreshToken(refreshToken)
      return await this.getProfile()
    } catch {
      this.logout()
      return null
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword })
  },

  async getProfileActivity(): Promise<Array<{ id: string; action: string; description: string; timestamp: string }>> {
    const { data } = await api.get('/users/activity')
    const activity = unwrap<Array<Record<string, unknown>>>({ data })
    return activity.map((entry, index) => ({
      id: String(entry.id ?? `act-${index}`),
      action: String(entry.action ?? 'Activity'),
      description: String(entry.description ?? ''),
      timestamp: String(entry.timestamp ?? new Date().toISOString()),
    }))
  },

  async send2FAVerification(): Promise<void> {
    await api.post('/auth/2fa/send-code')
  },

  async enable2FA(code: string): Promise<void> {
    try {
      await api.post('/auth/2fa/enable', { code })
    } finally {
      const user = this.getStoredUser()
      if (user) {
        const updated = { ...user, twoFactorEnabled: true }
        localStorage.setItem(USER_KEY, JSON.stringify(updated))
        localStorage.setItem(`${TWO_FA_KEY_PREFIX}${user.userId}`, 'true')
      }
    }
  },

  async disable2FA(code: string, currentPassword: string): Promise<void> {
    try {
      await api.post('/auth/2fa/disable', { code, currentPassword })
    } finally {
      const user = this.getStoredUser()
      if (user) {
        const updated = { ...user, twoFactorEnabled: false }
        localStorage.setItem(USER_KEY, JSON.stringify(updated))
        localStorage.setItem(`${TWO_FA_KEY_PREFIX}${user.userId}`, 'false')
      }
    }
  },

  async resend2FA(): Promise<void> {
    // Backend sends code on login; re-login required to resend
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(TEMP_TOKEN_KEY)
  },

  getStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      return null
    }
  },

  getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },
}

function persistSession(accessToken: string, refreshToken: string | undefined, user: User) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function mapUser(raw: Record<string, unknown>): User {
  const userId = String(raw.userId ?? '')
  const avatarDataUrl = localStorage.getItem(`${AVATAR_KEY_PREFIX}${userId}`) ?? undefined
  const twoFaStored = localStorage.getItem(`${TWO_FA_KEY_PREFIX}${userId}`)
  const twoFactorEnabled = twoFaStored === null
    ? Boolean(raw.twoFactorEnabled ?? true)
    : twoFaStored === 'true'
  return {
    userId,
    id: userId,
    fullName: String(raw.fullName ?? ''),
    email: String(raw.email ?? ''),
    stores: Array.isArray(raw.stores) ? raw.stores.map((store) => String(store)) : ['All Stores'],
    role: (typeof raw.role === 'string' ? raw.role.toLowerCase() : 'viewer') as User['role'],
    isActive: Boolean(raw.isActive ?? true),
    lastLogin: raw.lastLogin ? String(raw.lastLogin) : undefined,
    avatarDataUrl,
    phone: raw.phone ? String(raw.phone) : '',
    department: raw.department ? String(raw.department) : '',
    createdAt: raw.createdAt ? String(raw.createdAt) : raw.created_at ? String(raw.created_at) : undefined,
    twoFactorEnabled,
  }
}

export function saveUserAvatar(userId: string, dataUrl: string): void {
  localStorage.setItem(`${AVATAR_KEY_PREFIX}${userId}`, dataUrl)
  const rawUser = localStorage.getItem(USER_KEY)
  if (!rawUser) return
  try {
    const user = JSON.parse(rawUser) as User
    if (user.userId === userId) {
      localStorage.setItem(USER_KEY, JSON.stringify({ ...user, avatarDataUrl: dataUrl }))
    }
  } catch {
    // ignore cache parse failure
  }
}

export function clearUserAvatar(userId: string): void {
  localStorage.removeItem(`${AVATAR_KEY_PREFIX}${userId}`)
  const rawUser = localStorage.getItem(USER_KEY)
  if (!rawUser) return
  try {
    const user = JSON.parse(rawUser) as User
    if (user.userId === userId) {
      const next = { ...user }
      delete next.avatarDataUrl
      localStorage.setItem(USER_KEY, JSON.stringify(next))
    }
  } catch {
    // ignore cache parse failure
  }
}
