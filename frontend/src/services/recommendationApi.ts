import { api, unwrap } from './api'

export const recommendationApi = {
  async getSeasonal(): Promise<Record<string, unknown>[]> {
    // ML inference for all products can take time — allow up to 90s
    const { data } = await api.get('/recommendations/seasonal', { timeout: 90000 })
    return unwrap<Record<string, unknown>[]>({ data })
  },
}
