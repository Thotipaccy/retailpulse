import React, { useState } from 'react'
import { X, Receipt, CheckCircle } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'
import { useEscapeKey } from '../../hooks/useEscapeKey'

export interface TransactionData {
  transactionId: string;
  customerName: string;
  customerPhone: string;
  transactionDate: string;
  totalAmount: number;
  amountPaid?: number;
  balanceDue?: number;
}

interface RecordPaymentModalProps {
  isOpen: boolean
  transaction: TransactionData | null
  onClose: () => void
  onConfirm: (amount: number, method: string) => Promise<void>
}

export function RecordPaymentModal({ isOpen, transaction, onClose, onConfirm }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState<string>('')
  const [method, setMethod] = useState<string>('CASH')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(isOpen, onClose)

  if (!isOpen || !transaction) return null

  const maxAmount = transaction.balanceDue || 0

  const handlePayFull = () => {
    setAmount(maxAmount.toString())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Please enter a valid amount greater than 0.')
      return
    }
    if (Number(amount) > maxAmount) {
      setError(`Amount cannot exceed the balance due (${maxAmount.toLocaleString()} RWF)`)
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onConfirm(Number(amount), method)
      setAmount('')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      setError(error.response?.data?.message || error.message || 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <GlassCard strong className="relative w-full max-w-lg p-6">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/20">
              <Receipt className="h-5 w-5 text-copper-light" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-on-glass">Record Payment</h2>
              <p className="text-xs font-mono text-on-glass-muted">{transaction.transactionId}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-on-glass-muted hover:text-on-glass">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-black/20 p-4">
          <div>
            <span className="text-xs text-on-glass-muted">Customer</span>
            <p className="font-medium text-on-glass">{transaction.customerName}</p>
            <p className="text-xs text-on-glass-muted">{transaction.customerPhone}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-on-glass-muted">Transaction Date</span>
            <p className="font-medium text-on-glass">{new Date(transaction.transactionDate).toLocaleDateString()}</p>
          </div>
          <div className="col-span-2 mt-2 flex items-center justify-between border-t border-white/5 pt-3">
            <div>
              <span className="block text-xs text-on-glass-muted">Total Amount</span>
              <span className="text-sm text-on-glass">{transaction.totalAmount.toLocaleString()} RWF</span>
            </div>
            <div className="text-center">
              <span className="block text-xs text-on-glass-muted">Amount Paid</span>
              <span className="text-sm text-emerald-400">{transaction.amountPaid?.toLocaleString() || 0} RWF</span>
            </div>
            <div className="text-right">
              <span className="block text-xs font-semibold text-rust-light">Balance Due</span>
              <span className="text-lg font-bold text-rust-light">{maxAmount.toLocaleString()} RWF</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rust/20 bg-rust/10 p-3 text-sm text-rust-light">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-glass-muted">Payment Amount (RWF)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                max={maxAmount}
                step="1"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-on-glass placeholder:text-on-glass-muted/50 focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper"
                placeholder={`Enter amount up to ${maxAmount.toLocaleString()}`}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={handlePayFull}
                className="shrink-0 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-on-glass transition-colors hover:bg-white/20"
              >
                Pay Full
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-on-glass-muted">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#2C2A28] px-4 py-2.5 text-on-glass focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper"
              disabled={submitting}
            >
              <option value="CASH">Cash</option>
              <option value="MOMO">Mobile Money</option>
              <option value="CARD">Credit/Debit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !amount}
              className="flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Record Payment'}
              {!submitting && <CheckCircle className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  )
}
