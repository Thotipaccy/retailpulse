import type { Alert, Transaction } from '../types'
import type { ChartPoint, DashboardSummary } from '../types/api'
import { api, unwrap } from './api'

export const dashboardApi = {
  async getSummary(): Promise<DashboardSummary> {
    const { data } = await api.get('/dashboard/summary')
    return unwrap<DashboardSummary>({ data })
  },

  async getRecentTransactions(): Promise<Transaction[]> {
    const { data } = await api.get('/dashboard/recent-transactions')
    return unwrap<Transaction[]>({ data })
  },

  async getRecentAlerts(): Promise<Alert[]> {
    const { data } = await api.get('/dashboard/recent-alerts')
    return unwrap<Alert[]>({ data })
  },

  async getSalesTrend(): Promise<ChartPoint[]> {
    const { data } = await api.get('/dashboard/sales-trend')
    return unwrap<ChartPoint[]>({ data })
  },

  async getInventoryByCategory(): Promise<Array<{ category: string; inStock: number; lowStock: number; outOfStock: number }>> {
    const { data } = await api.get('/dashboard/inventory-by-category')
    return unwrap<Array<{ category: string; inStock: number; lowStock: number; outOfStock: number }>>({ data })
  },

  async getTopDemandProducts(limit = 3): Promise<Array<{ productId: string; productName: string; unitsSold: number; category: string; confidence?: number; trend?: 'up' | 'down'; status?: 'urgent' | 'reorder' | 'monitor' | 'adequate' }>> {
    const { data } = await api.get('/dashboard/top-demand-products', { params: { limit } })
    return unwrap<Array<{ productId: string; productName: string; unitsSold: number; category: string; confidence?: number; trend?: 'up' | 'down'; status?: 'urgent' | 'reorder' | 'monitor' | 'adequate' }>>({ data })
  },
}
