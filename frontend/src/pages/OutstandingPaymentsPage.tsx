import { useCallback, useEffect, useState } from 'react'
import { PageHeader, CardSkeleton } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { CheckCircle, Search } from 'lucide-react'
import { salesApi } from '../services/salesApi'
import { RecordPaymentModal } from '../components/modals/RecordPaymentModal'
import { Pagination } from '../components/ui/Pagination'
import type { TransactionData } from '../types/payment'

const PAGE_SIZE_DEFAULT = 10

type SortKey = 'newest' | 'oldest' | 'highest-balance' | 'due-soonest'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest-balance', label: 'Highest balance' },
  { value: 'due-soonest', label: 'Due soonest' },
]

export function OutstandingPaymentsPage() {
  const [outstanding, setOutstanding] = useState<TransactionData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [minBalance, setMinBalance] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)

  const loadOutstanding = useCallback(async () => {
    try {
      const data = await salesApi.getOutstanding()
      setOutstanding(data as unknown as TransactionData[])
    } catch (error) {
      console.error('Failed to load outstanding payments', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    salesApi.getOutstanding()
      .then((data) => { if (!cancelled) setOutstanding(data as unknown as TransactionData[]) })
      .catch((error) => console.error('Failed to load outstanding payments', error))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])


  const handleRecordPayment = async (amount: number, method: string) => {
    if (!selectedTransaction) return
    try {
      setActionError(null)
      await salesApi.recordPayment(selectedTransaction.transactionId, { amount, paymentMethod: method })
      await loadOutstanding()
      setSelectedTransaction(null)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string }
      setActionError(error.response?.data?.message || 'Failed to record payment')
      setSelectedTransaction(null)
    }
  }

  const filteredOutstanding = outstanding
    .filter(item => {
      const query = searchQuery.toLowerCase()
      if (
        !item.transactionId.toLowerCase().includes(query) &&
        !(item.customerName || '').toLowerCase().includes(query) &&
        !(item.customerPhone || '').toLowerCase().includes(query)
      ) return false

      const txDate = new Date(item.transactionDate)
      txDate.setHours(0, 0, 0, 0)
      if (dateFrom && txDate < new Date(`${dateFrom}T00:00:00`)) return false
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`)
        if (txDate > to) return false
      }
      if (minBalance !== '' && (item.balanceDue || 0) < Number(minBalance)) return false

      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
        case 'highest-balance':
          return (b.balanceDue || 0) - (a.balanceDue || 0)
        case 'due-soonest': {
          const da = a.expectedPaymentDate ? new Date(a.expectedPaymentDate).getTime() : Number.MAX_SAFE_INTEGER
          const db = b.expectedPaymentDate ? new Date(b.expectedPaymentDate).getTime() : Number.MAX_SAFE_INTEGER
          return da - db
        }
        default:
          return new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      }
    })

  const hasActiveFilters = Boolean(searchQuery || dateFrom || dateTo || minBalance !== '')

  const resetFilters = () => {
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setMinBalance('')
    setSortBy('newest')
    setCurrentPage(1)
  }

  const totalOutstanding = outstanding.reduce((sum, item) => sum + (item.balanceDue || 0), 0)

  // Paginate the filtered results
  const pagedItems = filteredOutstanding.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Outstanding Payments" description="Track and manage unpaid credit sales" />
        <CardSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Outstanding Payments" description="Track and manage unpaid credit sales" />

      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-on-glass">Pending Credit Sales</h2>
            <p className="text-sm text-on-glass-muted mt-1">
              Total Outstanding:{' '}
              <span className="font-bold text-rust-light">{totalOutstanding.toLocaleString()} RWF</span>
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-glass-muted" />
            <input
              type="text"
              placeholder="Search ID, name or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-charcoal-900/50 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-on-glass focus:outline-none focus:border-copper"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-white/5 bg-charcoal-900/30 p-4 lg:grid-cols-5">
          <label className="text-xs font-medium text-on-glass-muted">
            From date
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="mt-1 w-full bg-charcoal-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-on-glass focus:outline-none focus:border-copper"
            />
          </label>
          <label className="text-xs font-medium text-on-glass-muted">
            To date
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="mt-1 w-full bg-charcoal-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-on-glass focus:outline-none focus:border-copper"
            />
          </label>
          <label className="text-xs font-medium text-on-glass-muted">
            Min balance (RWF)
            <input
              type="number"
              min={0}
              placeholder="0"
              value={minBalance}
              onChange={(e) => { setMinBalance(e.target.value); setCurrentPage(1); }}
              className="mt-1 w-full bg-charcoal-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-on-glass focus:outline-none focus:border-copper"
            />
          </label>
          <label className="col-span-2 text-xs font-medium text-on-glass-muted lg:col-span-1">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as SortKey); setCurrentPage(1); }}
              className="mt-1 w-full bg-charcoal-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-on-glass focus:outline-none focus:border-copper"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters && sortBy === 'newest'}
              className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-on-glass-muted transition-colors hover:border-copper hover:text-copper-light disabled:pointer-events-none disabled:opacity-40"
            >
              Clear filters
            </button>
          </div>
        </div>

        {actionError && (
          <div className="mb-6 rounded-lg border border-rust/20 bg-rust/10 p-4 text-rust-light">
            {actionError}
          </div>
        )}

        {outstanding.length === 0 ? (
          <div className="text-center py-12 text-on-glass-muted border border-white/5 rounded-lg bg-charcoal-900/30">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
            <p>No outstanding payments. All credit sales have been settled.</p>
          </div>
        ) : filteredOutstanding.length === 0 ? (
          <div className="text-center py-12 text-on-glass-muted border border-white/5 rounded-lg bg-charcoal-900/30">
            <Search className="w-12 h-12 mx-auto mb-3 text-on-glass-muted/50" />
            <p>No transactions match your filters.</p>
            <button type="button" onClick={resetFilters} className="mt-3 text-sm text-copper-light hover:underline">
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold text-on-glass-muted uppercase tracking-wider">
                    <th className="p-3">Transaction</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-right">Balance Due (RWF)</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagedItems.map(item => (
                    <tr key={item.transactionId} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono text-copper-light text-xs">{item.transactionId}</td>
                      <td className="p-3 text-sm text-on-glass">{new Date(item.transactionDate).toLocaleDateString()}</td>
                      <td className="p-3 text-sm text-on-glass">
                        {item.customerName}
                        <div className="text-xs text-on-glass-muted">{item.customerPhone}</div>
                      </td>
                      <td className="p-3 text-sm text-rust">{item.expectedPaymentDate || 'Not set'}</td>
                      <td className="p-3 text-sm font-bold text-rust-light text-right">{item.balanceDue?.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setSelectedTransaction(item)}
                          className="px-3 py-1.5 bg-copper/20 hover:bg-copper/30 text-copper-light border border-copper/30 rounded text-xs font-semibold transition-colors"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={filteredOutstanding.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 20, 50]}
              className="border-t border-white/5 mt-2"
            />
          </>
        )}
      </Card>

      <RecordPaymentModal
        isOpen={!!selectedTransaction}
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onConfirm={handleRecordPayment}
      />
    </div>
  )
}
