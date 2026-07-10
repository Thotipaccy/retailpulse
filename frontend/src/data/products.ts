export interface ProductRecord {
  id: string
  name: string
  sku: string
  category: string
  categoryId?: string
  costPrice: number
  sellingPrice: number
  stock: number
  reorderPoint: number
  status: 'in_stock' | 'low' | 'critical' | 'out_of_stock'
  isActive: boolean
}

export function productStockStatus(stock: number, reorderPoint: number): ProductRecord['status'] {
  if (stock === 0) return 'out_of_stock'
  if (stock <= reorderPoint * 0.3) return 'critical'
  if (stock <= reorderPoint) return 'low'
  return 'in_stock'
}
