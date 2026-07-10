import { useEffect, useState } from 'react'
import { Info, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { inventoryApi } from '../../services/inventoryApi'
import { getErrorMessage } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { formatRWF } from '../../utils/format'
import type { StockItem } from '../../types/api'

export interface PurchaseLinePrefill {
  productId: string
  quantity: number
  unitCost: number
  supplier?: string
}

interface RecordPurchaseModalProps {
  open: boolean
  onClose: () => void
  products: StockItem[]
  onRecorded: () => void
  prefillItems?: PurchaseLinePrefill[]
  prefillSupplier?: string
  purchaseOrderId?: string
}

interface PurchaseLine {
  id: string
  productId: string
  quantity: string
  unitCost: string
  supplierChoice: string   // selected from dropdown or NEW_SUPPLIER
  supplierName: string     // typed name (for new supplier)
  supplierContact: string
  invoiceNumber: string
}

// Extended product info with purchase-cost and supplier from inventory context
interface ProductInfo extends StockItem {
  unitCost?: number
  latestSupplier?: string
  cheapestSupplier?: string
}

const NEW_SUPPLIER = '__new__'

function isNumeric(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0
}

function resolveSupplier(line: PurchaseLine): string {
  return line.supplierChoice === NEW_SUPPLIER
    ? line.supplierName.trim()
    : (line.supplierChoice || line.supplierName.trim())
}

function buildDefaultLine(
  id: string,
  product: ProductInfo | undefined,
  prefill: PurchaseLinePrefill | undefined,
  globalSupplier: string,
  allSuppliers: Array<{ name: string; contact: string }>,
): PurchaseLine {
  const productSupplier = product?.latestSupplier ?? product?.cheapestSupplier ?? ''
  const detectedSupplier = prefill?.supplier ?? globalSupplier ?? productSupplier
  const knownSupplierObj = allSuppliers.find((s) => s.name === detectedSupplier)
  return {
    id,
    productId: prefill?.productId ?? product?.productId ?? '',
    quantity: String(prefill?.quantity ?? 10),
    unitCost: String(prefill?.unitCost ?? product?.unitCost ?? ''),
    supplierChoice: knownSupplierObj ? knownSupplierObj.name : '',
    supplierName: knownSupplierObj ? knownSupplierObj.name : detectedSupplier,
    supplierContact: knownSupplierObj ? knownSupplierObj.contact : '',
    invoiceNumber: '',
  }
}

export function RecordPurchaseModal({
  open, onClose, products, onRecorded, prefillItems, prefillSupplier, purchaseOrderId,
}: RecordPurchaseModalProps) {
  const { toast } = useToast()
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [suppliers, setSuppliers] = useState<Array<{ name: string; contact: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const enrichedProducts = products as ProductInfo[]

  useEffect(() => {
    if (!open) return
    inventoryApi.getSuppliers().then((fetched) => {
      setSuppliers(fetched)
      const defaults: PurchaseLine[] = prefillItems?.length
        ? prefillItems.map((item, i) => {
            const product = enrichedProducts.find((p) => p.productId === item.productId)
            return buildDefaultLine(`line-${i}`, product, item, prefillSupplier ?? '', fetched)
          })
        : enrichedProducts.length
          ? [buildDefaultLine('line-0', enrichedProducts[0], undefined, prefillSupplier ?? '', fetched)]
          : []
      setLines(defaults)
    }).catch(() => {
      setSuppliers([])
      const defaults: PurchaseLine[] = enrichedProducts.length
        ? [buildDefaultLine('line-0', enrichedProducts[0], undefined, prefillSupplier ?? '', [])]
        : []
      setLines(defaults)
    })
  }, [open, products, prefillItems, prefillSupplier]) // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = () => {
    const next = enrichedProducts.find((p) => !lines.some((l) => l.productId === p.productId)) ?? enrichedProducts[0]
    setLines((prev) => [...prev, buildDefaultLine(`line-${Date.now()}`, next, undefined, '', suppliers)])
  }

  const handleProductChange = (lineId: string, productId: string) => {
    const product = enrichedProducts.find((p) => p.productId === productId)
    if (!product) return
    const productSupplier = product.latestSupplier ?? product.cheapestSupplier ?? ''
    const knownSupplierObj = suppliers.find((s) => s.name === productSupplier)
    setLines((prev) => prev.map((l) => l.id !== lineId ? l : {
      ...l,
      productId,
      unitCost: product.unitCost ? String(product.unitCost) : l.unitCost,
      supplierChoice: knownSupplierObj ? knownSupplierObj.name : '',
      supplierName: knownSupplierObj ? knownSupplierObj.name : productSupplier,
      supplierContact: knownSupplierObj && knownSupplierObj.contact ? knownSupplierObj.contact : l.supplierContact,
    }))
  }

  const updateLine = (id: string, patch: Partial<PurchaseLine>) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l))
  }

  const removeLine = (id: string) => {
    setLines((prev) => prev.length <= 1 ? prev : prev.filter((l) => l.id !== id))
  }

  const handleSubmit = async () => {
    for (const line of lines) {
      if (!line.productId) { toast('Each line must have a product', 'error'); return }
      if (!isNumeric(line.quantity) || Number(line.quantity) <= 0) { toast('Quantity must be a positive number', 'error'); return }
      if (!isNumeric(line.unitCost) || Number(line.unitCost) <= 0) { toast('Unit cost must be a positive number', 'error'); return }
      if (!resolveSupplier(line)) { toast('Each product must have a supplier', 'error'); return }
      if (line.supplierContact && !/^[+\d\s()-]+$/.test(line.supplierContact)) {
        toast('Supplier contact must contain only phone characters', 'error'); return
      }
      if (line.invoiceNumber && !/^[a-zA-Z0-9-]+$/.test(line.invoiceNumber)) {
        toast('Invoice number must be alphanumeric', 'error'); return
      }
    }
    setSubmitting(true)
    try {
      const payload = lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPurchaseCost: Number(line.unitCost),
        supplierName: resolveSupplier(line),
        supplierContact: line.supplierContact.trim() || undefined,
        invoiceNumber: line.invoiceNumber.trim() || undefined,
      }))
      if (payload.length === 1) {
        await inventoryApi.recordPurchase(payload[0])
      } else {
        await inventoryApi.recordPurchases(payload)
      }

      if (purchaseOrderId) {
        await inventoryApi.markPurchaseOrderReceived(purchaseOrderId)
      }

      toast(
        purchaseOrderId
          ? `PO received — stock updated for ${payload.length} product${payload.length > 1 ? 's' : ''}`
          : `Recorded ${payload.length} purchase${payload.length > 1 ? 's' : ''} and updated stock`,
        'success',
      )
      onRecorded()
      onClose()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const grandTotal = lines.reduce(
    (sum, l) => sum + (isNumeric(l.unitCost) && isNumeric(l.quantity) ? Number(l.unitCost) * Number(l.quantity) : 0),
    0,
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={purchaseOrderId ? 'Receive Purchase Order' : 'Record Inventory Purchase'}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">Cancel</button>
          {lines.length > 1 && (
            <span className="mr-auto text-sm text-on-glass-muted">
              Total: <span className="font-bold text-copper-light">{formatRWF(grandTotal)}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !products.length}
            className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light disabled:opacity-50"
          >
            {submitting ? 'Saving...' : purchaseOrderId ? 'Confirm Receipt' : 'Record Purchase'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        {purchaseOrderId && (
          <div className="flex items-center gap-2 rounded-lg border border-forest/30 bg-forest/10 px-3 py-2 text-xs text-forest-light">
            <Info className="h-4 w-4 shrink-0" />
            Receiving PO <span className="font-mono font-semibold">{purchaseOrderId}</span> — verify quantities before confirming.
          </div>
        )}

        {/* Per-product lines */}
        <div className="space-y-4">
          {lines.map((line) => {
            const product = enrichedProducts.find((p) => p.productId === line.productId)
            const lineTotal = isNumeric(line.unitCost) && isNumeric(line.quantity)
              ? Number(line.unitCost) * Number(line.quantity)
              : 0
            const resolvedSup = resolveSupplier(line)

            return (
              <div key={line.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                {/* Product + Qty + Cost row */}
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-on-glass-muted">Product</label>
                    <select
                      title="Product"
                      value={line.productId}
                      onChange={(e) => handleProductChange(line.id, e.target.value)}
                      className="glass-input w-full rounded-lg px-3 py-2 text-sm"
                    >
                      {products.map((p) => (
                        <option key={p.productId} value={p.productId}>{p.productName}</option>
                      ))}
                    </select>
                    {product && (
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-on-glass-muted">
                        <span>{product.category}</span>
                        <span>On hand: <span className="font-medium text-on-glass">{product.quantityOnHand}</span></span>
                        <span>Sell: <span className="font-medium text-on-glass">{formatRWF(product.unitPrice)}</span></span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-on-glass-muted">Qty to receive</label>
                    <input
                      title="Quantity"
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-glass"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-on-glass-muted">Unit Cost (RWF)</label>
                      <input
                        title="Unit Cost"
                        type="number"
                        min={1}
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.id, { unitCost: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-glass"
                      />
                      {lineTotal > 0 && (
                        <p className="mt-0.5 text-xs text-on-glass-muted">
                          Line total: <span className="font-medium text-copper-light">{formatRWF(lineTotal)}</span>
                        </p>
                      )}
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="mt-5 rounded-lg p-2 text-rust-light hover:bg-rust/10"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Per-line supplier section */}
                <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="mb-2 text-xs font-medium text-on-glass-muted">Supplier for this product</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-on-glass-muted">Supplier</label>
                      <select
                        title="Supplier"
                        value={line.supplierChoice}
                        onChange={(e) => {
                          const val = e.target.value
                          const matched = suppliers.find((s) => s.name === val)
                          updateLine(line.id, {
                            supplierChoice: val,
                            supplierName: val !== NEW_SUPPLIER ? val : line.supplierName,
                            supplierContact: matched && matched.contact ? matched.contact : line.supplierContact,
                          })
                        }}
                        className="glass-input w-full rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Select supplier...</option>
                        {suppliers.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                        <option value={NEW_SUPPLIER}>+ New supplier</option>
                      </select>
                    </div>
                    {(line.supplierChoice === NEW_SUPPLIER || !line.supplierChoice) && (
                      <div>
                        <label className="mb-1 block text-xs text-on-glass-muted">Supplier name</label>
                        <input
                          title="Supplier name"
                          value={line.supplierName}
                          onChange={(e) => updateLine(line.id, { supplierName: e.target.value })}
                          placeholder="Enter name..."
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-glass"
                        />
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs text-on-glass-muted">Contact (opt.)</label>
                      <input
                        title="Contact"
                        value={line.supplierContact}
                        onChange={(e) => updateLine(line.id, { supplierContact: e.target.value })}
                        placeholder="+250 700..."
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-glass"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-on-glass-muted">Invoice # (opt.)</label>
                      <input
                        title="Invoice"
                        value={line.invoiceNumber}
                        onChange={(e) => updateLine(line.id, { invoiceNumber: e.target.value })}
                        placeholder="INV-001"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-glass"
                      />
                    </div>
                    {resolvedSup && (
                      <div className="sm:col-span-3 text-xs text-on-glass-muted">
                        ✓ Will be recorded from <span className="font-medium text-forest-light">{resolvedSup}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-medium text-copper-light hover:underline">
            <Plus className="h-3.5 w-3.5" />
            Add another product
          </button>
        </div>
      </div>
    </Dialog>
  )
}
