import type {
  DemandForecastResult,
  ForecastAccuracy,
  ForecastPoint,
  ForecastStatus,
} from '../types/api'
import { api, unwrap } from './api'

export const forecastApi = {
  async getStatus(): Promise<ForecastStatus> {
    const { data } = await api.get('/forecast/status')
    return unwrap<ForecastStatus>({ data })
  },

  async generateDemandForecast(
    horizon: 'daily' | 'weekly' | 'monthly',
    scope: 'all' | 'category' | 'product' = 'all',
    id?: string,
  ): Promise<DemandForecastResult> {
    const { data } = await api.get('/forecast/demand', {
      params: { horizon, scope, id: id || undefined },
    })
    return unwrap<DemandForecastResult>({ data })
  },

  async getProductForecast(id: string, horizon = 'weekly'): Promise<ForecastPoint[]> {
    const { data } = await api.get(`/forecast/product/${id}`, { params: { horizon } })
    return unwrap<ForecastPoint[]>({ data })
  },

  async getAccuracy(): Promise<ForecastAccuracy> {
    const { data } = await api.get('/forecast/accuracy')
    return unwrap<ForecastAccuracy>({ data })
  },
}
