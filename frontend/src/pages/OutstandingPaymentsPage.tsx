import React, { useEffect, useState } from 'react'
import { PageHeader, CardSkeleton } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { salesApi } from '../services/salesApi'

export function OutstandingPaymentsPage() {
  const [outstanding, setOutstanding] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOutstanding()
  }, [])

  const loadOutstanding = async () => {
    try {
      setLoading(true)
      const data = await salesApi.getOutstanding()
      setOutstanding(data)
    } catch (error) {
      console.error('Failed to load outstanding payments', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsPaid = async (transactionId: string) => {
    if (!window.confirm('Are you sure you want to mark this transaction as PAID?')) return
    try {
      await salesApi.markAsPaid(transactionId)
      await loadOutstanding()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to mark as paid')
    }
  }

  const totalOutstanding = outstanding.reduce((sum, item) => sum + item.totalAmount, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Outstanding Payments" icon={AlertCircle} description="Track and manage unpaid credit sales" />
        <CardSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Outstanding Payments" icon={AlertCircle} description="Track and manage unpaid credit sales" />

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-on-glass">Pending Credit Sales</h2>
          <div className="bg-rust/20 text-rust-light px-4 py-2 rounded-lg font-bold border border-rust/30">
            Total: {totalOutstanding.toLocaleString()} RWF
          </div>
        </div>

        {outstanding.length === 0 ? (
          <div className="text-center py-12 text-on-glass-muted border border-white/5 rounded-lg bg-charcoal-900/30">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
            <p>No outstanding payments. All credit sales have been settled.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold text-on-glass-muted uppercase tracking-wider">
                  <th className="p-3">Transaction</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3 text-right">Amount (RWF)</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {outstanding.map(item => (
                  <tr key={item.transactionId} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-medium text-copper-light">{item.transactionId.substring(0,8).toUpperCase()}</td>
                    <td className="p-3 text-sm text-on-glass">{new Date(item.transactionDate).toLocaleDateString()}</td>
                    <td className="p-3 text-sm text-on-glass">
                      {item.customerName}
                      <div className="text-xs text-on-glass-muted">{item.customerPhone}</div>
                    </td>
                    <td className="p-3 text-sm text-rust">{item.expectedPaymentDate || 'Not set'}</td>
                    <td className="p-3 text-sm font-bold text-on-glass text-right">{item.totalAmount.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <button 
                        onClick={() => handleMarkAsPaid(item.transactionId)}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-500 border border-emerald-500/30 rounded text-xs font-semibold transition-colors"
                      >
                        Mark as Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
