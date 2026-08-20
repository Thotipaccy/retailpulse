import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Package, Plus, Search } from 'lucide-react'
import type { ProductRecord } from '../data/products'
import { productApi } from '../services/productApi'
import { getErrorMessage } from '../services/api'
import { formatRWFExact } from '../utils/format'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Dialog } from '../components/ui/Dialog'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchProductsExportData } from '../services/exportDataService'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { useToast } from '../contexts/ToastContext'

function stockBadge(status: ProductRecord['status']) {
  switch (status) {
    case 'in_stock': return <StatusBadge variant="success">In Stock</StatusBadge>
    case 'low': return <StatusBadge variant="warning">Low Stock</StatusBadge>
    case 'critical': return <StatusBadge variant="danger">Critical</StatusBadge>
    case 'out_of_stock': return <StatusBadge variant="danger">Out of Stock</StatusBadge>
  }
}

const EMPTY_FORM = {
  name: '', sku: '', categoryChoice: '', category: '', costPrice: '', sellingPrice: '', reorderPoint: '20', stock: '0',
}

export function ProductManagementPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low' | 'out_of_stock'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ProductRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    productApi.getAll()
      .then(setProducts)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const categories = useMemo(() => ['all', ...Array.from(new Set(products.map((p) => p.category)))], [products])

  const filtered = useMemo(() => products.filter((p) => {
    const q = search.toLowerCase()
    if (category !== 'all' && p.category !== category) return false
    if (statusFilter === 'active' && !p.isActive) return false
    if (statusFilter === 'inactive' && p.isActive) return false
    if (stockFilter === 'in_stock' && p.status !== 'in_stock') return false
    if (stockFilter === 'low' && p.status !== 'low') return false
    if (stockFilter === 'out_of_stock' && p.status !== 'out_of_stock' && p.status !== 'critical') return false
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
    return true
  }), [products, search, category, statusFilter, stockFilter])


  const paginated = useMemo(() => {
    return filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [filtered, currentPage, pageSize])

  const openAdd = () => { setEditProduct(null); setForm(EMPTY_FORM); setModalOpen(true) }

  const openEdit = (p: ProductRecord) => {
    setEditProduct(p)
    setForm({
      name: p.name, sku: p.sku, categoryChoice: p.category, category: p.category,
      costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice),
      reorderPoint: String(p.reorderPoint), stock: String(p.stock),
    })
    setModalOpen(true)
  }

  const saveProduct = async () => {
    const stock = Number(form.stock)
    const reorderPoint = Number(form.reorderPoint)
    const finalCategoryName = form.categoryChoice === '__new__' ? form.category.trim() : (form.categoryChoice || form.category.trim())
    const categoryProduct = products.find((p) => p.category === finalCategoryName)
    const payload = {
      name: form.name,
      productName: form.name,
      sku: form.sku,
      skuCode: form.sku,
      categoryId: categoryProduct?.categoryId ?? finalCategoryName,
      costPrice: Number(form.costPrice),
      unitCost: Number(form.costPrice),
      sellingPrice: Number(form.sellingPrice),
      unitPrice: Number(form.sellingPrice),
      reorderPoint,
      ...(editProduct ? {} : { stock }),
    }
    setSaving(true)
    try {
      if (editProduct) {
        await productApi.update(editProduct.id, payload)
        toast(`${form.name} updated`, 'success')
      } else {
        await productApi.create(payload)
        toast(`${form.name} added`, 'success')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDeactivate = async () => {
    try {
      await Promise.all([...selected].map((id) => productApi.deactivate(id)))
      toast(`${selected.size} products deactivated`, 'success')
      setSelected(new Set())
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={Package}
        title="Product Management"
        subtitle="Manage catalog, pricing, and stock levels"
        actions={(
          <>
            <button type="button" onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass hover:glass">
              <Download className="h-4 w-4" />
              Export All
            </button>
            <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </>
        )}
      />

      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
            <input type="search" title="Search products" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search products..." className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-sm" />
          </div>
          <select title="Category filter" value={category} onChange={(e) => { setCategory(e.target.value); setCurrentPage(1); }} className="glass-input rounded-lg px-3 py-2 text-sm">
            {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
          <select title="Stock filter" value={stockFilter} onChange={(e) => { setStockFilter(e.target.value as typeof stockFilter); setCurrentPage(1); }} className="glass-input rounded-lg px-3 py-2 text-sm">
            <option value="all">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
          <select title="Status filter" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }} className="glass-input rounded-lg px-3 py-2 text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {selected.size > 0 && (
            <button type="button" onClick={bulkDeactivate} className="rounded-lg px-3 py-2 text-sm text-rust-light hover:bg-rust/10">
              Deactivate ({selected.size})
            </button>
          )}
        </div>
      </GlassCard>

      {products.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="No products" description="No products found in the catalog." />
      ) : (
        <GlassCard className="overflow-x-auto">
          <div className="border-b border-white/10 px-4 py-3 text-sm text-on-glass-muted">
            Showing <span className="font-medium text-on-glass">{filtered.length}</span> of{' '}
            <span className="font-medium text-on-glass">{products.length}</span> products
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No matches" description="No products match your search filters." />
          ) : (
            <>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="px-4 py-3 w-12 font-medium">#</th>
                  <th className="px-4 py-3"><span className="sr-only">Select</span></th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, index) => (
                  <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 ${!p.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-center font-medium text-on-glass-muted">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-3"><input type="checkbox" title="Select product" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-copper" /></td>
                    <td className="px-4 py-3 font-medium text-on-glass">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-copper-light">{p.sku}</td>
                    <td className="px-4 py-3 text-on-glass-muted">{p.category}</td>
                    <td className="px-4 py-3 text-right text-on-glass">{formatRWFExact(p.costPrice)}</td>
                    <td className="px-4 py-3 text-right text-on-glass">{formatRWFExact(p.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right text-on-glass">{p.stock}</td>
                    <td className="px-4 py-3 text-right text-on-glass-muted">{p.reorderPoint}</td>
                    <td className="px-4 py-3">{!p.isActive ? <StatusBadge variant="neutral">Inactive</StatusBadge> : stockBadge(p.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(p)} className="text-xs text-copper-light hover:underline">Edit</button>
                        {p.isActive ? (
                          <button type="button" onClick={() => setDeactivateTarget(p)} className="text-xs text-rust-light hover:underline">Delete</button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await productApi.reactivate(p.id)
                                setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, isActive: true } : x))
                                toast(`${p.name} reactivated`, 'success')
                              } catch (err) {
                                toast(getErrorMessage(err), 'error')
                              }
                            }}
                            className="text-xs text-forest-light hover:underline"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              className="mt-4 px-4 pb-4"
            />
            </>
          )}
        </GlassCard>
      )}

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editProduct ? 'Edit Product' : 'Add Product'}
        maxWidth="max-w-md"
        footer={(
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted">Cancel</button>
            <button type="button" onClick={() => void saveProduct()} disabled={!form.name || !form.sku || saving} className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="pmp-name" className="text-xs text-on-glass-muted">Name</label>
            <input id="pmp-name" title="Name" placeholder="Product name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="pmp-sku" className="text-xs text-on-glass-muted">SKU</label>
            <input id="pmp-sku" title="SKU" placeholder="SKU" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="pmp-category" className="text-xs text-on-glass-muted">Category</label>
            <select id="pmp-category" title="Category" value={form.categoryChoice} onChange={(e) => setForm((f) => ({ ...f, categoryChoice: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
              <option value="">Select category...</option>
              {categories.filter((c) => c !== 'all').map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Add new category</option>
            </select>
            {(form.categoryChoice === '__new__' || (!form.categoryChoice && categories.length <= 1)) && (
              <input title="New category name" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="New category name" className="glass-input mt-2 w-full rounded-lg px-3 py-2 text-sm" />
            )}
          </div>
          <div>
            <label htmlFor="pmp-cost" className="text-xs text-on-glass-muted">Unit Cost (RWF)</label>
            <input id="pmp-cost" title="Unit Cost" placeholder="Unit cost" type="number" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="pmp-price" className="text-xs text-on-glass-muted">Unit Price (RWF)</label>
            <input id="pmp-price" title="Unit Price" placeholder="Unit price" type="number" value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="pmp-reorder" className="text-xs text-on-glass-muted">Reorder Point</label>
            <input id="pmp-reorder" title="Reorder Point" placeholder="Reorder point" type="number" value={form.reorderPoint} onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
          </div>
          {!editProduct && (
            <div>
              <label htmlFor="pmp-stock" className="text-xs text-on-glass-muted">Initial Stock</label>
              <input id="pmp-stock" title="Initial Stock" placeholder="Initial stock" type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>
      </Dialog>

      <DeactivateConfirmModal
        isOpen={!!deactivateTarget}
        itemName={deactivateTarget?.name ?? 'this product'}
        onConfirm={() => {
          if (deactivateTarget) {
            void productApi.deactivate(deactivateTarget.id)
              .then(() => {
                toast(`${deactivateTarget.name} has been deactivated.`, 'success')
                load()
              })
              .catch((err) => toast(getErrorMessage(err), 'error'))
          }
          setDeactivateTarget(null)
        }}
        onCancel={() => setDeactivateTarget(null)}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Products"
        fileName="products"
        resolveExportData={fetchProductsExportData}
      />
    </div>
  )
}
