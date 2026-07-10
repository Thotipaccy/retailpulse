import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { inventoryApi } from '../../services/inventoryApi'
import { formatRWF } from '../../utils/format'
import { getErrorMessage } from '../../services/api'
import { EmptyState } from '../ui/PageHeader'
import type { PurchaseHistoryItem } from '../../types/api'

interface ProductPurchaseHistoryModalProps {
  open: boolean
  onClose: () => void
  productId: string | null
  productName: string
}

export function ProductPurchaseHistoryModal({ open, onClose, productId, productName }: ProductPurchaseHistoryModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([])

  useEffect(() => {
    if (!open || !productId) return
    setLoading(true)
    setError(null)
    inventoryApi.getPurchaseHistory(productId)
      .then(setHistory)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [open, productId])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Purchase History — ${productName}`}
      maxWidth="max-w-3xl"
      footer={(
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">Close</button>
      )}
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-on-glass-muted">Loading purchase history...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rust-light">{error}</p>
      ) : history.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="No purchase history" description="Record a purchase to start tracking supplier prices for this product." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-on-glass-muted">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium text-right">Quantity</th>
                <th className="pb-3 pr-4 font-medium text-right">Unit Cost</th>
                <th className="pb-3 pr-4 font-medium">Supplier</th>
                <th className="pb-3 font-medium text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.purchaseId ?? `${row.date}-${row.supplier}`} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-on-glass">{row.date}</td>
                  <td className="py-3 pr-4 text-right text-on-glass">{row.quantity}</td>
                  <td className="py-3 pr-4 text-right text-on-glass">{formatRWF(Number(row.unitCost))}</td>
                  <td className="py-3 pr-4 text-on-glass">{row.supplier}</td>
                  <td className="py-3 text-right font-medium text-copper-light">{formatRWF(Number(row.totalCost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  )
}
