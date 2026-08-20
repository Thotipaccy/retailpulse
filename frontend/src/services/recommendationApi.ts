import { api, unwrap } from './api'

export const recommendationApi = {
  async getSeasonal(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/recommendations/seasonal', { timeout: 90000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async getFbt(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/recommendations/fbt', { timeout: 30000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async getUpsell(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/recommendations/upsell', { timeout: 30000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async getPersonalized(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/recommendations/personalized', { timeout: 30000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async getSummary(): Promise<Record<string, unknown>> {
    const { data } = await api.get('/recommendations/summary', { timeout: 15000 })
    return unwrap<Record<string, unknown>>({ data })
  },

  async getCrossSell(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/recommendations/cross-sell', { timeout: 30000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },
}
