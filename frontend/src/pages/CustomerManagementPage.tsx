import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { type CustomerRecord } from '../data/customers'
import { customerApi } from '../services/customerApi'
import { getErrorMessage } from '../services/api'
import { ROUTES } from '../config/routes'
import { formatRWF } from '../utils/format'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { StatusBadge, getChurnRiskBadge } from '../components/ui/StatusBadge'
import { Dialog } from '../components/ui/Dialog'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { useToast } from '../contexts/ToastContext'
import type { Customer } from '../types'

const EMPTY: { name: string; phone: string; email: string; type: CustomerRecord['type'] } = { name: '', phone: '', email: '', type: 'retail' }

function customerToRecord(c: Customer): CustomerRecord {
  return {
    id: c.customerId,
    name: c.customerName,
    phone: c.phone ?? '',
    email: c.email ?? '',
    type: (c.customerType as CustomerRecord['type']) ?? 'retail',
    lifetimeValue: Number(c.lifetimeValue ?? 0),
    rfmSegment: c.rfmSegment ?? 'New',
    churnRisk: Number(c.churnRiskScore ?? 0),
    isActive: Boolean(c.isActive ?? true),
  }
}

export function CustomerManagementPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<CustomerRecord | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<CustomerRecord | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    customerApi.search()
      .then((data) => setCustomers(data.map(customerToRecord)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    customerApi.search()
      .then((data) => {
        if (!cancelled) setCustomers(data.map(customerToRecord))
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const segments = useMemo(() => ['all', ...Array.from(new Set(customers.map((c) => c.rfmSegment)))], [customers])

  const filtered = useMemo(() => customers.filter((c) => {
    const q = search.toLowerCase()
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (segmentFilter !== 'all' && c.rfmSegment !== segmentFilter) return false
    if (statusFilter === 'active' && !c.isActive) return false
    if (statusFilter === 'inactive' && c.isActive) return false
    if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !c.email.toLowerCase().includes(q)) return false
    return true
  }), [customers, search, typeFilter, segmentFilter, statusFilter])


  const pagedItems = useMemo(() => {
    return filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [filtered, currentPage, pageSize])

  const openAdd = () => { setEditCustomer(null); setForm(EMPTY); setModalOpen(true) }
  const openEdit = (c: CustomerRecord) => {
    setEditCustomer(c)
    setForm({ name: c.name, phone: c.phone, email: c.email, type: c.type })
    setModalOpen(true)
  }

  const saveCustomer = async () => {
    try {
      if (editCustomer) {
        const updated = await customerApi.update(editCustomer.id, {
          customerName: form.name,
          customerType: form.type,
          phone: form.phone,
          email: form.email,
        })
        setCustomers((prev) => prev.map((c) => c.id === editCustomer.id ? customerToRecord(updated) : c))
        toast(`${form.name} updated`, 'success')
      } else {
        const created = await customerApi.create({
          customerName: form.name,
          customerType: form.type,
          phone: form.phone,
          email: form.email,
        })
        setCustomers((prev) => [...prev, customerToRecord(created)])
        toast(`${form.name} added`, 'success')
      }
      setModalOpen(false)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={Users}
        title="Customer Management"
        subtitle="Full customer directory and lifecycle management"
        actions={(
          <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        )}
      />

      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by name, phone, email..." className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }} title="Filter by customer type" className="glass-input rounded-lg px-3 py-2 text-sm">
            <option value="all">All Types</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="contractor">Contractor</option>
          </select>
          <select value={segmentFilter} onChange={(e) => { setSegmentFilter(e.target.value); setCurrentPage(1); }} title="Filter by segment" className="glass-input rounded-lg px-3 py-2 text-sm">
            {segments.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Segments' : s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as 'all'|'active'|'inactive'); setCurrentPage(1); }} title="Filter by status" className="glass-input rounded-lg px-3 py-2 text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </GlassCard>

      {customers.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No customers" description="No customers found in the directory." />
      ) : (
        <GlassCard className="overflow-x-auto">
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No matches" description="No customers match your search filters." />
          ) : (
            <>
              <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">LTV</th>
                  <th className="px-4 py-3 font-medium">RFM</th>
                  <th className="px-4 py-3 font-medium">Churn</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((c, index) => (
                  <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 ${!c.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-on-glass-muted">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => navigate(ROUTES.CUSTOMER(c.id))} className="font-medium text-copper-light hover:underline">{c.name}</button>
                    </td>
                    <td className="px-4 py-3 text-on-glass-muted">{c.phone}</td>
                    <td className="px-4 py-3 text-on-glass-muted">{c.email}</td>
                    <td className="px-4 py-3 capitalize text-on-glass">{c.type}</td>
                    <td className="px-4 py-3 text-right text-on-glass">{formatRWF(c.lifetimeValue)}</td>
                    <td className="px-4 py-3"><StatusBadge variant="neutral">{c.rfmSegment}</StatusBadge></td>
                    <td className="px-4 py-3">
                      {(() => {
                        const churn = getChurnRiskBadge(c.churnRisk)
                        return <StatusBadge variant={churn.variant}>{churn.label}</StatusBadge>
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(c)} className="text-xs text-copper-light hover:underline">Edit</button>
                        {c.isActive ? (
                          <button type="button" onClick={() => setDeactivateTarget(c)} className="text-xs text-rust-light hover:underline">Delete</button>
                        ) : (
                          <button type="button" onClick={async () => { 
                            try {
                              const updated = await customerApi.reactivate(c.id)
                              setCustomers((prev) => prev.map((x) => x.id === c.id ? customerToRecord(updated) : x))
                              toast(`${c.name} reactivated`, 'success')
                            } catch (err) {
                              toast(getErrorMessage(err), 'error')
                            }
                          }} className="text-xs text-forest-light hover:underline">Reactivate</button>
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

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} title={editCustomer ? 'Edit Customer' : 'Add Customer'} footer={(
        <>
          <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted">Cancel</button>
          <button type="button" onClick={saveCustomer} disabled={!form.name} className="rounded-lg bg-copper px-4 py-2 text-sm text-white disabled:opacity-50">Save</button>
        </>
      )}>
        <div className="space-y-3">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="glass-input w-full rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="glass-input w-full rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="glass-input w-full rounded-lg px-3 py-2 text-sm" />
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CustomerRecord['type'] }))} title="Customer type" className="glass-input w-full rounded-lg px-3 py-2 text-sm capitalize">
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
      </Dialog>

      <DeactivateConfirmModal
        isOpen={!!deactivateTarget}
        itemName={deactivateTarget?.name ?? 'this customer'}
        onConfirm={async () => {
          if (deactivateTarget) {
            try {
              const updated = await customerApi.deactivate(deactivateTarget.id)
              setCustomers((prev) => prev.map((c) => c.id === deactivateTarget.id ? customerToRecord(updated) : c))
              toast(`${deactivateTarget.name} has been deactivated.`, 'success')
            } catch (err) {
              toast(getErrorMessage(err), 'error')
            }
          }
          setDeactivateTarget(null)
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  )
}
