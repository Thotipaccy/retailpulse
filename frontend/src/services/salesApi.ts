import type { ChartPoint, HeatmapPoint, SalesOverview } from '../types/api'
import { api, unwrap } from './api'

export const salesApi = {
  async getOverview(period: string, startDate?: string, endDate?: string): Promise<SalesOverview> {
    const { data } = await api.get('/sales/overview', { params: { period, startDate, endDate } })
    return unwrap<SalesOverview>({ data })
  },

  async getByCategory(period?: string, startDate?: string, endDate?: string): Promise<ChartPoint[]> {
    const { data } = await api.get('/sales/by-category', { params: { period, startDate, endDate } })
    return unwrap<ChartPoint[]>({ data })
  },

  async getByPaymentMethod(period?: string, startDate?: string, endDate?: string): Promise<ChartPoint[]> {
    const { data } = await api.get('/sales/by-payment-method', { params: { period, startDate, endDate } })
    return unwrap<ChartPoint[]>({ data })
  },

  async getTopProducts(limit = 10, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/sales/top-products', { params: { limit, period, startDate, endDate } })
    return unwrap<Record<string, unknown>[]>({ data })
  },

  async getHeatmap(period?: string, startDate?: string, endDate?: string): Promise<HeatmapPoint[]> {
    const { data } = await api.get('/sales/heatmap', { params: { period, startDate, endDate } })
    return unwrap<HeatmapPoint[]>({ data })
  },

  async recordSale(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data } = await api.post('/sales/record', payload)
    return unwrap<Record<string, unknown>>({ data })
  },

  async recordPayment(transactionId: string, payload: { amount: number; paymentMethod?: string }): Promise<Record<string, unknown>> {
    const { data } = await api.post(`/sales/${transactionId}/pay`, payload)
    return unwrap<Record<string, unknown>>({ data })
  },

  async getOutstanding(): Promise<Record<string, unknown>[]> {
    const { data } = await api.get('/sales/outstanding')
    return unwrap<Record<string, unknown>[]>({ data })
  },
}
