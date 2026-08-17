import { useCallback, useEffect, useState } from 'react'
import { PageHeader, CardSkeleton } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { CheckCircle, Search } from 'lucide-react'
import { salesApi } from '../services/salesApi'
import { RecordPaymentModal } from '../components/modals/RecordPaymentModal'
import { Pagination } from '../components/ui/Pagination'
import type { TransactionData } from '../types/payment'

const PAGE_SIZE_DEFAULT = 10

export function OutstandingPaymentsPage() {
  const [outstanding, setOutstanding] = useState<TransactionData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)

  const loadOutstanding = useCallback(async () => {
    try {
      setLoading(true)
      const data = await salesApi.getOutstanding()
      setOutstanding(data as unknown as TransactionData[])
    } catch (error) {
      console.error('Failed to load outstanding payments', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOutstanding()
  }, [loadOutstanding])


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

  const filteredOutstanding = outstanding.filter(item => {
    const query = searchQuery.toLowerCase()
    return (
      item.transactionId.toLowerCase().includes(query) ||
      (item.customerName || '').toLowerCase().includes(query) ||
      (item.customerPhone || '').toLowerCase().includes(query)
    )
  })

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
            <p>No transactions match your search.</p>
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
