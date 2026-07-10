import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { ProductRecord } from '../../data/products'
import { productApi } from '../../services/productApi'
import { inventoryApi } from '../../services/inventoryApi'
import { getErrorMessage } from '../../services/api'
import { GlassCard } from '../ui/GlassCard'
import { formatRWF } from '../../utils/format'
import { useToast } from '../../contexts/ToastContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'

export interface POItem {
  id: string
  productId: string
  productName: string
  sku: string
  quantity: number
  unitCost: number
  supplier: string
}

interface PurchaseOrderModalProps {
  open: boolean
  onClose: () => void
  initialItems: POItem[]
  products?: ProductRecord[]
}

const SUPPLIERS = ['Kigali Hardware Ltd', 'East Africa Supplies', 'Rwanda Builders Co', 'ProTools Rwanda']

function resolveProductId(item: POItem, catalog: ProductRecord[]): string {
  if (item.productId && catalog.some((p) => p.id === item.productId)) return item.productId
  const bySku = catalog.find((p) => p.sku === item.sku)
  if (bySku) return bySku.id
  return catalog[0]?.id ?? ''
}

function productToItem(productId: string, catalog: ProductRecord[], overrides?: Partial<POItem>): POItem {
  const product = catalog.find((p) => p.id === productId) ?? catalog[0]
  if (!product) {
    return {
      id: overrides?.id ?? `new-${Date.now()}`,
      productId: '',
      productName: 'Unknown',
      sku: '—',
      quantity: overrides?.quantity ?? 10,
      unitCost: overrides?.unitCost ?? 0,
      supplier: overrides?.supplier ?? SUPPLIERS[0],
    }
  }
  return {
    id: overrides?.id ?? `new-${Date.now()}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantity: overrides?.quantity ?? 10,
    unitCost: overrides?.unitCost ?? product.costPrice,
    supplier: overrides?.supplier ?? SUPPLIERS[0],
  }
}

export function PurchaseOrderModal({ open, onClose, initialItems, products: productsProp }: PurchaseOrderModalProps) {
  const { toast } = useToast()
  const [items, setItems] = useState<POItem[]>([])
  const [catalog, setCatalog] = useState<ProductRecord[]>(productsProp ?? [])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (productsProp?.length) {
      setCatalog(productsProp.filter((p) => p.isActive))
      return
    }
    if (open) {
      productApi.getAll()
        .then((data) => setCatalog(data.filter((p) => p.isActive)))
        .catch(() => setCatalog([]))
    }
  }, [open, productsProp])

  useEffect(() => {
    if (open && catalog.length) {
      setItems(initialItems.map((i) => ({
        ...i,
        productId: resolveProductId(i, catalog),
      })))
    } else if (open) {
      setItems(initialItems)
    }
  }, [open, initialItems, catalog])

  const totalCost = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
    [items],
  )

  const primarySupplier = items[0]?.supplier ?? 'Supplier'

  const updateItem = (id: string, patch: Partial<POItem>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i))
  }

  const selectProduct = (itemId: string, productId: string) => {
    const product = catalog.find((p) => p.id === productId)
    if (!product) return
    updateItem(itemId, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitCost: product.costPrice,
    })
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const addItem = () => {
    const usedIds = new Set(items.map((i) => i.productId))
    const nextProduct = catalog.find((p) => !usedIds.has(p.id)) ?? catalog[0]
    if (!nextProduct) return
    setItems((prev) => [...prev, productToItem(nextProduct.id, catalog, { id: `new-${Date.now()}` })])
  }

  const handleSend = async () => {
    setSubmitting(true)
    try {
      const payload = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitCost,
        supplier: item.supplier,
      }))
      await inventoryApi.submitPurchaseOrder(payload)
      toast(`Purchase order sent to ${primarySupplier}`, 'success')
      onClose()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  useEscapeKey(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <GlassCard strong className="relative flex max-h-[90vh] w-full max-w-3xl flex-col p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-glass">Create Purchase Order</h2>
          <button type="button" onClick={onClose} className="text-on-glass-muted hover:text-on-glass" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {catalog.length === 0 ? (
          <p className="mt-6 text-center text-sm text-on-glass-muted">No products available to add to purchase order.</p>
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="w-10 pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Product</th>
                  <th className="pb-2 pr-2 font-medium">Qty</th>
                  <th className="pb-2 pr-2 font-medium">Unit Cost</th>
                  <th className="pb-2 pr-2 font-medium">Supplier</th>
                  <th className="pb-2 pr-2 text-right font-medium">Total</th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b border-white/5">
                    <td className="py-2 pr-2 text-center font-medium text-on-glass-muted">{index + 1}</td>
                    <td className="py-2 pr-2">
                      <select value={resolveProductId(item, catalog)} onChange={(e) => selectProduct(item.id, e.target.value)} className="glass-input w-full min-w-[180px] rounded-lg px-2 py-1.5 text-sm text-on-glass">
                        {catalog.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-on-glass-muted">{item.sku}</p>
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} className="glass-input w-20 rounded-lg px-2 py-1 text-sm" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min={0} value={item.unitCost} onChange={(e) => updateItem(item.id, { unitCost: Number(e.target.value) })} className="glass-input w-28 rounded-lg px-2 py-1 text-sm" />
                    </td>
                    <td className="py-2 pr-2">
                      <select value={item.supplier} onChange={(e) => updateItem(item.id, { supplier: e.target.value })} className="glass-input w-full min-w-[140px] rounded-lg px-2 py-1 text-xs">
                        {SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2 text-right font-medium text-on-glass">{formatRWF(item.quantity * item.unitCost)}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => removeItem(item.id)} className="text-rust-light hover:text-rust" aria-label="Remove item">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {catalog.length > 0 && (
          <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-1 text-sm text-copper-light hover:underline">
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-on-glass-muted">
            <span className="font-medium text-on-glass">{items.length}</span> items · Total:{' '}
            <span className="font-bold text-copper-light">{formatRWF(totalCost)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass">Cancel</button>
            <button type="button" disabled={items.length === 0 || catalog.length === 0 || submitting} onClick={() => void handleSend()} className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50">{submitting ? 'Sending...' : 'Send Order'}</button>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
