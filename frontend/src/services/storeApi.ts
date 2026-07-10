import type { Store } from '../types'
import { api, unwrap } from './api'

export const storeApi = {
  async getAll(): Promise<Store[]> {
    const { data } = await api.get('/stores')
    return unwrap<Store[]>({ data })
  },

  async getById(id: string): Promise<Store> {
    const { data } = await api.get(`/stores/${id}`)
    return unwrap<Store>({ data })
  },

  async compare(ids: string[]): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/stores/compare', { params: { ids: ids.join(',') } })
    return unwrap<Record<string, unknown>[]>({ data })
  },
}
