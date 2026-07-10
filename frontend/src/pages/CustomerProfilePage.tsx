import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { customerApi } from '../services/customerApi'
import { getErrorMessage } from '../services/api'
import { formatCurrency, formatDate } from '../utils/format'
import { GlassCard } from '../components/ui/GlassCard'
import { ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ROUTES } from '../config/routes'
import type { Customer } from '../types'

export function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    customerApi.getById(id)
      .then(setCustomer)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <LoadingSkeleton rows={4} />
  if (error || !customer) return <ErrorState message={error ?? 'Customer not found'} onRetry={() => navigate(ROUTES.CUSTOMERS)} />

  const churnPct = Math.round(Number(customer.churnRiskScore) * 100)

  return (
    <div>
      <button type="button" onClick={() => navigate(ROUTES.CUSTOMERS)} className="mb-4 inline-flex items-center gap-2 text-sm text-copper-light hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </button>

      <GlassCard className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-glass">{customer.customerName}</h1>
            <p className="capitalize text-on-glass-muted">{customer.customerType}</p>
            <div className="mt-2"><StatusBadge variant="info">{customer.rfmSegment}</StatusBadge></div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold text-on-glass">Contact Information</h3>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3 text-sm text-on-glass-muted"><Phone className="h-4 w-4" />{customer.phone}</div>
              <div className="flex items-center gap-3 text-sm text-on-glass-muted"><Mail className="h-4 w-4" />{customer.email}</div>
            </div>
            <h3 className="mt-6 font-semibold text-on-glass">Purchase Summary</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div><p className="text-xs text-on-glass-muted">Lifetime Value</p><p className="mt-1 text-lg font-bold text-on-glass">{formatCurrency(Number(customer.lifetimeValue))}</p></div>
              <div><p className="text-xs text-on-glass-muted">Total Orders</p><p className="mt-1 text-lg font-bold text-on-glass">{customer.totalOrders}</p></div>
              <div><p className="text-xs text-on-glass-muted">RFM Segment</p><p className="mt-1 text-lg font-bold text-on-glass">{customer.rfmSegment}</p></div>
              <div><p className="text-xs text-on-glass-muted">Last Purchase</p><p className="mt-1 text-lg font-bold text-on-glass">{formatDate(customer.lastPurchaseDate)}</p></div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-on-glass">Churn Risk</h3>
            <p className="mt-4 text-4xl font-bold text-on-glass">{churnPct}%</p>
            <div className="mt-2"><StatusBadge variant={churnPct >= 60 ? 'danger' : churnPct >= 30 ? 'warning' : 'success'}>
              {churnPct >= 60 ? 'High Risk' : churnPct >= 30 ? 'Moderate' : 'Low Risk'}
            </StatusBadge></div>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
