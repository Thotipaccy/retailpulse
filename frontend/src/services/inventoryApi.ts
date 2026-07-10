import type { InventorySummary, PurchaseHistoryItem, StockItem } from '../types/api'
import type { ChartPoint } from '../types/api'
import { api, unwrap } from './api'

export const inventoryApi = {
  async getSummary(): Promise<InventorySummary> {
    const { data } = await api.get('/inventory/summary')
    return unwrap<InventorySummary>({ data })
  },

  async getStockLevels(): Promise<StockItem[]> {
    const { data } = await api.get('/inventory/stock-levels')
    return unwrap<StockItem[]>({ data })
  },

  async getTurnover(): Promise<ChartPoint[]> {
    const { data } = await api.get('/inventory/turnover')
    return unwrap<ChartPoint[]>({ data })
  },

  async getStockoutRisks(): Promise<StockItem[]> {
    const { data } = await api.get('/inventory/stockout-risks')
    return unwrap<StockItem[]>({ data })
  },

  async getReorderRecommendations(): Promise<StockItem[]> {
    const { data } = await api.get('/inventory/reorder-recommendations')
    return unwrap<StockItem[]>({ data })
  },

  async getVelocity(): Promise<{
    monthly: Array<{ month: string; unitsSold: number }>
    fastMovers: Array<{ category: string; unitsSold: number; revenue: number }>
    slowMovers: Array<{ category: string; unitsSold: number; revenue: number }>
  }> {
    const { data } = await api.get('/inventory/velocity')
    const result = unwrap<Record<string, unknown>>({ data })
    const monthly = Array.isArray(result.monthly) ? result.monthly : []
    const fastMovers = Array.isArray(result.fastMovers) ? result.fastMovers : []
    const slowMovers = Array.isArray(result.slowMovers) ? result.slowMovers : []
    return {
      monthly: monthly.map((m) => {
        const row = m as Record<string, unknown>
        return { month: String(row.month ?? ''), unitsSold: Number(row.unitsSold ?? 0) }
      }),
      fastMovers: fastMovers.map((m) => {
        const row = m as Record<string, unknown>
        return {
          category: String(row.category ?? ''),
          unitsSold: Number(row.unitsSold ?? 0),
          revenue: Number(row.revenue ?? 0),
        }
      }),
      slowMovers: slowMovers.map((m) => {
        const row = m as Record<string, unknown>
        return {
          category: String(row.category ?? ''),
          unitsSold: Number(row.unitsSold ?? 0),
          revenue: Number(row.revenue ?? 0),
        }
      }),
    }
  },

  async getSuppliers(): Promise<Array<{ name: string; contact: string }>> {
    const { data } = await api.get('/inventory/suppliers')
    return unwrap<Array<{ name: string; contact: string }>>({ data })
  },

  async getBestTimeToBuy(productId: string): Promise<{
    available: boolean
    bestMonth?: string
    avgUnitCost?: number
    recommendedSupplier?: string
  }> {
    const { data } = await api.get('/inventory/best-time-to-buy', { params: { productId } })
    const row = unwrap<Record<string, unknown>>({ data })
    return {
      available: Boolean(row.available),
      bestMonth: row.bestMonth != null ? String(row.bestMonth) : undefined,
      avgUnitCost: row.avgUnitCost != null ? Number(row.avgUnitCost) : undefined,
      recommendedSupplier: row.recommendedSupplier != null ? String(row.recommendedSupplier) : undefined,
    }
  },

  async submitPurchaseOrder(items: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { data } = await api.post('/inventory/purchase-orders', items)
    return unwrap<Record<string, unknown>>({ data })
  },

  async autoCreatePurchaseOrders(): Promise<Record<string, unknown>> {
    const { data } = await api.post('/inventory/auto-reorder')
    return unwrap<Record<string, unknown>>({ data })
  },

  async getPendingPurchaseOrders(): Promise<Array<{
    orderId: string
    status: string
    totalAmount: number
    createdAt: string
    items: Array<{
      productId: string
      productName: string
      quantity: number
      unitPrice: number
      supplier: string
    }>
  }>> {
    const { data } = await api.get('/inventory/purchase-orders/pending')
    return unwrap<Array<{ orderId: string, status: string, totalAmount: number, createdAt: string, items: Array<{ productId: string, productName: string, quantity: number, unitPrice: number, supplier: string }> }>>({ data })
  },

  async markPurchaseOrderReceived(orderId: string): Promise<void> {
    await api.post(`/inventory/purchase-orders/${orderId}/receive`)
  },

  async recordPurchase(body: {
    productId: string
    quantity: number
    unitPurchaseCost: number
    supplierName: string
    supplierContact?: string
    invoiceNumber?: string
    storeId?: string
  }): Promise<Record<string, unknown>> {
    const { data } = await api.post('/inventory/purchase', body)
    return unwrap<Record<string, unknown>>({ data })
  },

  async recordPurchases(items: Array<{
    productId: string
    quantity: number
    unitPurchaseCost: number
    supplierName: string
    supplierContact?: string
    invoiceNumber?: string
    storeId?: string
  }>): Promise<Record<string, unknown>> {
    const { data } = await api.post('/inventory/purchases/batch', items)
    return unwrap<Record<string, unknown>>({ data })
  },

  async getPurchaseHistory(productId: string): Promise<PurchaseHistoryItem[]> {
    const { data } = await api.get('/inventory/purchase-history', { params: { productId } })
    const rows = unwrap<Record<string, unknown>[]>({ data })
    return rows.map((row) => ({
      purchaseId: row.purchaseId != null ? String(row.purchaseId) : undefined,
      date: String(row.date ?? ''),
      quantity: Number(row.quantity ?? 0),
      unitCost: Number(row.unitCost ?? 0),
      supplier: String(row.supplier ?? ''),
      totalCost: Number(row.totalCost ?? 0),
      supplierContact: row.supplierContact != null ? String(row.supplierContact) : undefined,
      invoiceNumber: row.invoiceNumber != null ? String(row.invoiceNumber) : undefined,
    }))
  },
}
