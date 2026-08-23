import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Package, Tag } from 'lucide-react'
import { productApi } from '../services/productApi'
import { inventoryApi } from '../services/inventoryApi'
import { formatCurrency, formatDate, formatRWF } from '../utils/format'
import { GlassCard } from '../components/ui/GlassCard'
import { ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ROUTES } from '../config/routes'
import type { ProductRecord } from '../data/products'
import type { PurchaseHistoryItem } from '../types/api'

const STATUS_VARIANT: Record<ProductRecord['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  in_stock: 'success',
  low: 'warning',
  critical: 'danger',
  out_of_stock: 'danger',
}

const STATUS_LABEL: Record<ProductRecord['status'], string> = {
  in_stock: 'In Stock',
  low: 'Low Stock',
  critical: 'Critical',
  out_of_stock: 'Out of Stock',
}

export function ProductProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<ProductRecord | null>(null)
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.allSettled([productApi.getAll(), inventoryApi.getPurchaseHistory(id)])
      .then(([productsRes, historyRes]) => {
        if (cancelled) return
        if (productsRes.status === 'fulfilled') {
          setProduct(productsRes.value.find((p) => p.id === id) ?? null)
        }
        if (historyRes.status === 'fulfilled') {
          setHistory([...historyRes.value].sort((a, b) => b.date.localeCompare(a.date)))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  if (loading) return <LoadingSkeleton rows={5} />
  if (!product) return <ErrorState message="Product not found" onRetry={() => navigate(ROUTES.PRODUCTS)} />

  const stockValue = product.stock * product.costPrice
  const retailValue = product.stock * product.sellingPrice
  const totalPurchased = history.reduce((sum, h) => sum + h.quantity, 0)
  const totalSpend = history.reduce((sum, h) => sum + h.totalCost, 0)

  return (
    <div>
      <button type="button" onClick={() => navigate(ROUTES.PRODUCTS)} className="mb-4 inline-flex items-center gap-2 text-sm text-copper-light hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </button>

      <GlassCard className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-copper/15">
                <Package className="h-5 w-5 text-copper-light" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-on-glass">{product.name}</h1>
                <p className="font-mono text-sm text-on-glass-muted">{product.sku}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge variant={STATUS_VARIANT[product.status]}>{STATUS_LABEL[product.status]}</StatusBadge>
              <StatusBadge variant={product.isActive ? 'info' : 'neutral'}>{product.isActive ? 'Active' : 'Inactive'}</StatusBadge>
            </div>
          </div>
          <div className="text-sm text-on-glass-muted">
            <p className="flex items-center gap-2"><Tag className="h-4 w-4" />{product.category}</p>
            <p className="mt-2">Cost {formatRWF(product.costPrice)} · Price {formatRWF(product.sellingPrice)}</p>
          </div>
        </div>

        <h3 className="mt-6 font-semibold text-on-glass">Stock Overview</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div><p className="text-xs text-on-glass-muted">Quantity On Hand</p><p className="mt-1 text-lg font-bold text-on-glass">{product.stock.toLocaleString()}</p></div>
          <div><p className="text-xs text-on-glass-muted">Reorder Point</p><p className="mt-1 text-lg font-bold text-on-glass">{product.reorderPoint.toLocaleString()}</p></div>
          <div><p className="text-xs text-on-glass-muted">Stock Value (cost)</p><p className="mt-1 text-lg font-bold text-on-glass">{formatCurrency(stockValue)}</p></div>
          <div><p className="text-xs text-on-glass-muted">Retail Value</p><p className="mt-1 text-lg font-bold text-on-glass">{formatCurrency(retailValue)}</p></div>
        </div>

        <h3 className="mt-6 font-semibold text-on-glass">Purchase History</h3>
        <p className="mt-1 text-sm text-on-glass-muted">
          {history.length
            ? `${totalPurchased.toLocaleString()} units purchased across ${history.length} orders — total spend ${formatCurrency(totalSpend)}`
            : 'No purchase records yet for this product.'}
        </p>
        {history.length > 0 && (
          <GlassCard className="mt-3 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-wider text-on-glass-muted">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Unit Cost</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.slice(0, 25).map((h) => (
                    <tr key={h.purchaseId ?? `${h.date}-${h.supplier}`} className="text-on-glass">
                      <td className="px-5 py-3 text-on-glass-muted">{formatDate(h.date)}</td>
                      <td className="px-5 py-3">{h.supplier}</td>
                      <td className="px-5 py-3 text-right">{h.quantity.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-on-glass-muted">{formatRWF(h.unitCost)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(h.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </GlassCard>
    </div>
  )
}
