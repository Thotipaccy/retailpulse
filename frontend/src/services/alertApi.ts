import type { AlertPreferencesData } from '../types/alerts'
import { api, unwrap } from './api'

const PREFS_CACHE_KEY = 'retailpulse_alert_preferences'

export const alertApi = {
  async getAlerts(filter: 'all' | 'unread' = 'all') {
    const { data } = await api.get('/alerts', { params: { filter } })
    return unwrap<import('../types').Alert[]>({ data })
  },

  async markRead(id: string): Promise<void> {
    const { data } = await api.put(`/alerts/${id}/read`)
    unwrap({ data })
  },

  async markAllRead(): Promise<void> {
    const { data } = await api.put('/alerts/read-all')
    unwrap({ data })
  },

  async deleteAlert(id: string): Promise<void> {
    const { data } = await api.delete(`/alerts/${id}`)
    unwrap({ data })
  },

  async clearAllAlerts(): Promise<void> {
    const { data } = await api.delete('/alerts/clear-all')
    unwrap({ data })
  },

  async getRules(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/alerts/rules')
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async updateRule(id: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data } = await api.put(`/alerts/rules/${id}`, updates)
    return unwrap<Record<string, unknown>>({ data })
  },

  async getPreferences(): Promise<AlertPreferencesData> {
    const { data } = await api.get('/alerts/preferences')
    const prefs = unwrap<AlertPreferencesData>({ data })
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs))
    return prefs
  },

  async savePreferences(preferences: AlertPreferencesData): Promise<AlertPreferencesData> {
    const { data } = await api.put('/alerts/preferences', preferences)
    const saved = unwrap<AlertPreferencesData>({ data })
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(saved))
    return saved
  },

  async resetPreferences(): Promise<AlertPreferencesData> {
    const { data } = await api.post('/alerts/preferences/reset')
    const reset = unwrap<AlertPreferencesData>({ data })
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(reset))
    return reset
  },

  getCachedPreferences(): AlertPreferencesData | null {
    try {
      const raw = localStorage.getItem(PREFS_CACHE_KEY)
      return raw ? JSON.parse(raw) as AlertPreferencesData : null
    } catch {
      return null
    }
  },
}
