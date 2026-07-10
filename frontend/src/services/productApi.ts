import type { ProductRecord } from '../data/products'
import { productStockStatus } from '../data/products'
import { api, unwrap } from './api'

function mapApiProduct(raw: Record<string, unknown>): ProductRecord {
  const stock = Number(raw.quantityOnHand ?? 0)
  const reorderPoint = Number(raw.reorderPoint ?? 0)
  const unitCost = Number(raw.unitCost ?? 0)
  const unitPrice = Number(raw.unitPrice ?? 0)
  return {
    id: String(raw.productId ?? raw.id ?? ''),
    name: String(raw.productName ?? raw.name ?? ''),
    sku: String(raw.skuCode ?? raw.sku ?? ''),
    category: String(raw.category ?? ''),
    categoryId: raw.categoryId ? String(raw.categoryId) : undefined,
    costPrice: unitCost,
    sellingPrice: unitPrice,
    stock,
    reorderPoint,
    status: productStockStatus(stock, reorderPoint),
    isActive: Boolean(raw.isActive ?? true),
  }
}

export const productApi = {
  async getAll(): Promise<ProductRecord[]> {
    const { data } = await api.get('/products')
    const products = unwrap<Array<Record<string, unknown>>>({ data })
    return products.map(mapApiProduct)
  },

  async create(payload: Record<string, unknown>): Promise<ProductRecord> {
    const { data } = await api.post('/products', payload)
    return mapApiProduct(unwrap<Record<string, unknown>>({ data }))
  },

  async update(id: string, payload: Record<string, unknown>): Promise<ProductRecord> {
    const { data } = await api.put(`/products/${id}`, payload)
    return mapApiProduct(unwrap<Record<string, unknown>>({ data }))
  },

  async deactivate(id: string): Promise<void> {
    const { data } = await api.delete(`/products/${id}`)
    unwrap({ data })
  },
}
