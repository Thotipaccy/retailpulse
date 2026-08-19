import { useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { CheckCircle, Tag, User, Calendar, AlertTriangle, CreditCard } from 'lucide-react'
import type { Customer } from '../../types'

interface CartItem {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
}

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
  customers: Customer[]
  subtotal: number
  onConfirm: (payload: {
    paymentMethod: string
    paymentReference?: string
    discountAmount: number
    customerName: string
    customerPhone: string
    expectedPaymentDate?: string
  }) => Promise<void>
}

export function CheckoutModal({
  isOpen,
  onClose,
  cart,
  customers,
  subtotal,
  onConfirm,
}: CheckoutModalProps) {
  const [discount, setDiscount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<string>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const total = Math.max(0, subtotal - discount)
  const isCredit = paymentMethod === 'credit'
  const isValid = !isCredit || (customerName.trim() !== '' && customerPhone.trim() !== '' && dueDate !== '')

  const handleSubmit = async () => {
    if (!isValid) return
    setIsSubmitting(true)
    try {
      await onConfirm({
        paymentMethod,
        paymentReference: ['mobile_money', 'airtel', 'bank_transfer'].includes(paymentMethod) ? paymentReference : undefined,
        discountAmount: discount,
        customerName,
        customerPhone,
        expectedPaymentDate: isCredit && dueDate ? dueDate : undefined,
      })
      // Reset form on success
      setDiscount(0)
      setPaymentMethod('cash')
      setPaymentReference('')
      setCustomerName('')
      setCustomerPhone('')
      setDueDate('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const footer = (
    <div className="flex w-full justify-between items-center gap-3">
      <button onClick={onClose} className="btn-secondary px-6" disabled={isSubmitting}>
        Cancel
      </button>
      <button
        onClick={handleSubmit}
        disabled={!isValid || isSubmitting}
        className="btn-primary px-8 flex items-center gap-2"
      >
        {isSubmitting ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
        ) : (
          <><CheckCircle className="w-4 h-4" /> Confirm Sale</>
        )}
      </button>
    </div>
  )

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Review & Payment"
      maxWidth="max-w-4xl"
      footer={footer}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 -mx-6 -mt-2">
        {/* LEFT: Order Summary */}
        <div className="bg-charcoal-900/60 px-6 py-4 border-r border-white/10 flex flex-col min-h-0">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted mb-4">Order Summary</h3>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
            {cart.map(item => (
              <div key={item.productId} className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-on-glass truncate" title={item.productName}>{item.productName}</p>
                  <p className="text-xs text-on-glass-muted">{item.quantity} × {item.unitPrice.toLocaleString()}</p>
                </div>
                <p className="font-semibold text-sm text-on-glass whitespace-nowrap">{(item.quantity * item.unitPrice).toLocaleString()} RWF</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="flex justify-between text-sm text-on-glass-muted">
              <span>Subtotal</span>
              <span>{subtotal.toLocaleString()} RWF</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm text-emerald-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Discount
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={discount || ''}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="0"
                  className="w-24 px-2 py-1 bg-charcoal-800 border border-white/10 rounded text-right text-sm focus:border-copper outline-none"
                />
                <span className="text-xs text-on-glass-muted">RWF</span>
              </div>
            </div>
            <div className="flex justify-between items-end pt-3 mt-1 border-t border-copper/20">
              <span className="text-sm font-bold uppercase tracking-wider text-on-glass-muted">Total Due</span>
              <span className="text-2xl font-extrabold text-copper-light">
                {total.toLocaleString()} <span className="text-sm">RWF</span>
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Payment Details */}
        <div className="px-6 py-4 space-y-5 overflow-y-auto max-h-80">
          {/* Payment Method */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-on-glass-muted uppercase tracking-wider">
              <CreditCard className="w-3.5 h-3.5 inline mr-1.5" />Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2.5 bg-charcoal-900 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none appearance-none cursor-pointer"
            >
              <option value="cash">💵  Cash</option>
              <option value="mobile_money">📱  MTN Mobile Money</option>
              <option value="airtel">📲  Airtel Money</option>
              <option value="bank_transfer">🏦  Bank Transfer</option>
              <option value="credit">📋  Credit (Pay Later)</option>
            </select>
            {['mobile_money', 'airtel', 'bank_transfer'].includes(paymentMethod) && (
              <input
                type="text"
                placeholder="Transaction reference / phone"
                value={paymentReference}
                onChange={e => setPaymentReference(e.target.value)}
                className="w-full px-3 py-2 bg-charcoal-900 border border-white/10 rounded-lg text-sm text-on-glass focus:border-copper outline-none mt-1"
              />
            )}
          </div>

          {/* Customer Info */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-on-glass-muted uppercase tracking-wider">
                <User className="w-3.5 h-3.5 inline mr-1" />Customer Details
              </label>
              {isCredit && (
                <span className="text-[10px] text-rust bg-rust/10 px-2 py-0.5 rounded-full border border-rust/20">
                  Required for Credit
                </span>
              )}
            </div>

            <datalist id="checkout-customer-names">
              {customers.map(c => <option key={c.customerId} value={c.customerName} />)}
            </datalist>
            <datalist id="checkout-customer-phones">
              {customers.filter(c => c.phone).map(c => <option key={c.customerId} value={c.phone} />)}
            </datalist>

            <input
              type="text"
              list="checkout-customer-names"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={e => {
                setCustomerName(e.target.value)
                const match = customers.find(c => c.customerName.toLowerCase() === e.target.value.toLowerCase())
                if (match && match.phone && !customerPhone) setCustomerPhone(match.phone)
              }}
              className={`w-full px-3 py-2 bg-charcoal-900 border ${isCredit && !customerName ? 'border-rust/50 focus:border-rust' : 'border-white/10 focus:border-copper'} rounded-lg text-sm text-on-glass outline-none placeholder:text-on-glass-muted/50`}
            />
            <input
              type="text"
              list="checkout-customer-phones"
              placeholder="Phone number (optional)"
              value={customerPhone}
              onChange={e => {
                setCustomerPhone(e.target.value)
                const match = customers.find(c => c.phone && c.phone === e.target.value)
                if (match && !customerName) setCustomerName(match.customerName)
              }}
              className={`w-full px-3 py-2 bg-charcoal-900 border ${isCredit && !customerPhone ? 'border-rust/50 focus:border-rust' : 'border-white/10 focus:border-copper'} rounded-lg text-sm text-on-glass outline-none placeholder:text-on-glass-muted/50`}
            />

            {isCredit && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-on-glass-muted flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className={`w-full px-3 py-2 bg-charcoal-900 border ${!dueDate ? 'border-rust/50 focus:border-rust' : 'border-white/10 focus:border-copper'} rounded-lg text-sm text-on-glass outline-none`}
                />
              </div>
            )}
          </div>

          {isCredit && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2 text-sm text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <p>This sale will be recorded as unpaid. The customer must pay by the due date.</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
