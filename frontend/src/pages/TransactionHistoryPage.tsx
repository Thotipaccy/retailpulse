import { useState, useEffect, useMemo, useRef } from 'react'
import html2pdf from 'html2pdf.js'
import { PageHeader } from '../components/ui/PageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { Pagination } from '../components/ui/Pagination'
import {
  Search, Filter, Download, Phone, Printer, Eye, EyeOff,
  CheckCircle, AlertTriangle, Clock, Calendar, User, CreditCard, Receipt
} from 'lucide-react'
import { salesApi } from '../services/salesApi'

interface TxItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface Transaction {
  transactionId: string
  transactionDate: string
  totalAmount: number
  discountAmount: number
  paymentMethod: string
  paymentStatus: string
  paymentReference?: string
  customerName?: string
  customerPhone?: string
  cashierName: string
  items: TxItem[]
}

const PM_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'MTN MoMo',
  airtel: 'Airtel Money',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit',
}

const PM_EMOJIS: Record<string, string> = {
  cash: '💵',
  mobile_money: '📱',
  airtel: '📲',
  bank_transfer: '🏦',
  credit: '📋',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
      <CheckCircle className="w-3 h-3" /> PAID
    </span>
  )
  if (status === 'UNPAID') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rust/15 text-rust border border-rust/20">
      <AlertTriangle className="w-3 h-3" /> UNPAID
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20">
      <Clock className="w-3 h-3" /> PARTIAL
    </span>
  )
}

export function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pmFilter, setPmFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null)
  const PAGE_SIZE = 15
  const receiptRef = useRef<HTMLDivElement>(null)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const data = await salesApi.getHistory({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setTransactions(data as unknown as Transaction[])
    } catch (err) {
      console.error('Failed to load transaction history', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchHistory() }, [])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = !search
        || tx.transactionId.toLowerCase().includes(search.toLowerCase())
        || (tx.customerName ?? '').toLowerCase().includes(search.toLowerCase())
        || (tx.customerPhone ?? '').includes(search)
      const matchStatus = statusFilter === 'all' || tx.paymentStatus === statusFilter
      const matchPm = pmFilter === 'all' || tx.paymentMethod === pmFilter
      return matchSearch && matchStatus && matchPm
    })
  }, [transactions, search, statusFilter, pmFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleApplyDate = () => {
    setCurrentPage(1)
    void fetchHistory()
  }

  const printOrDownloadPdf = async (tx: Transaction, mode: 'print' | 'download') => {
    setReceiptTx(tx)
    await new Promise(r => setTimeout(r, 100)) // let DOM render
    if (mode === 'print') {
      window.print()
    } else {
      const el = document.getElementById('history-receipt-area')
      if (!el) return
      
      el.classList.remove('opacity-0')
      await html2pdf().set({
        margin: 3,
        filename: `Receipt_${tx.transactionId.substring(3, 11).toUpperCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: [80, 200], orientation: 'portrait' },
      }).from(el).save()
      el.classList.add('opacity-0')
    }
    setReceiptTx(null)
  }

  const shareWhatsApp = async (tx: Transaction) => {
    await printOrDownloadPdf(tx, 'download')
    const lines = [
      `*Quincaillerie du Rwamagana*`,
      `Rwamagana, Eastern Province`,
      ``,
      `*RECEIPT #${tx.transactionId.substring(3, 11).toUpperCase()}*`,
      new Date(tx.transactionDate).toLocaleString(),
      ``,
      ...tx.items.map(i => `${i.productName}\n  ${i.quantity} × ${Number(i.unitPrice).toLocaleString()} = ${Number(i.lineTotal).toLocaleString()} RWF`),
      `─────────────────────────`,
      `*TOTAL: ${Number(tx.totalAmount).toLocaleString()} RWF*`,
      ``,
      tx.paymentStatus === 'PAID' ? `✅ *PAID — ${(PM_LABELS[tx.paymentMethod] ?? tx.paymentMethod).toUpperCase()}*` : `⚠️ *CREDIT — PAYMENT PENDING*`,
      tx.customerName ? `Customer: ${tx.customerName}` : '',
      tx.customerPhone ? `Phone: ${tx.customerPhone}` : '',
      ``,
      `_Thank you for your purchase!_`,
    ].filter(Boolean).join('\n')

    let phone = (tx.customerPhone ?? '').replace(/\D/g, '')
    if (phone.length === 10 && phone.startsWith('0')) phone = '250' + phone.substring(1)
    else if (phone.length === 9 && phone.startsWith('7')) phone = '250' + phone

    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`
      : `https://wa.me/?text=${encodeURIComponent(lines)}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6 pb-10 print:hidden">
      <PageHeader
        title="Transaction History"
        description="Browse, filter and re-print all past sales receipts"
      />

      {/* Filters */}
      <GlassCard strong className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-glass-muted" />
            <input
              type="text"
              placeholder="Search by ID, customer name or phone…"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 bg-charcoal-900/60 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none placeholder:text-on-glass-muted"
            />
          </div>

          {/* Payment Status */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="px-3 py-2.5 bg-charcoal-900/60 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partial</option>
          </select>

          {/* Payment Method */}
          <select
            value={pmFilter}
            onChange={e => { setPmFilter(e.target.value); setCurrentPage(1) }}
            className="px-3 py-2.5 bg-charcoal-900/60 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none appearance-none"
          >
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="mobile_money">MTN MoMo</option>
            <option value="airtel">Airtel Money</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit</option>
          </select>

          {/* Date range + Apply */}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="w-4 h-4 text-on-glass-muted shrink-0" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 bg-charcoal-900/60 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none" />
              <span className="text-on-glass-muted text-sm">→</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="flex-1 px-3 py-2 bg-charcoal-900/60 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none" />
            </div>
            <button onClick={handleApplyDate} className="btn-primary px-5 py-2 flex items-center gap-2 text-sm">
              <Filter className="w-4 h-4" /> Apply
            </button>
          </div>
        </div>

        <p className="text-xs text-on-glass-muted">
          Showing <span className="text-copper-light font-semibold">{filtered.length}</span> transaction{filtered.length !== 1 ? 's' : ''}
        </p>
      </GlassCard>

      {/* Table */}
      <GlassCard strong className="overflow-hidden p-0">
        {loading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-on-glass-muted">
            <div className="w-5 h-5 border-2 border-copper/30 border-t-copper rounded-full animate-spin" />
            Loading transactions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-on-glass-muted">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No transactions match your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-on-glass-muted text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Receipt #</th>
                    <th className="text-left px-4 py-3">Date & Time</th>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Payment</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => (
                    <>
                      <tr key={tx.transactionId}
                        className="border-b border-white/5 hover:bg-white/3 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === tx.transactionId ? null : tx.transactionId)}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-copper-light">
                            #{tx.transactionId.substring(3, 11).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-glass-muted text-xs">
                          {new Date(tx.transactionDate).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {tx.customerName ? (
                            <div>
                              <p className="font-medium text-on-glass">{tx.customerName}</p>
                              {tx.customerPhone && <p className="text-xs text-on-glass-muted">{tx.customerPhone}</p>}
                            </div>
                          ) : (
                            <span className="text-on-glass-muted opacity-50 text-xs">Walk-in</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs">
                            {PM_EMOJIS[tx.paymentMethod] ?? '💳'} {PM_LABELS[tx.paymentMethod] ?? tx.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-on-glass tabular-nums">
                          {Number(tx.totalAmount).toLocaleString()} RWF
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={tx.paymentStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setExpandedId(expandedId === tx.transactionId ? null : tx.transactionId)}
                              title="View items"
                              className="p-1.5 rounded-lg hover:bg-white/10 text-on-glass-muted hover:text-on-glass transition-all"
                            >
                              {expandedId === tx.transactionId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => printOrDownloadPdf(tx, 'print')}
                              title="Print receipt"
                              className="p-1.5 rounded-lg hover:bg-white/10 text-on-glass-muted hover:text-on-glass transition-all"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => printOrDownloadPdf(tx, 'download')}
                              title="Download PDF"
                              className="p-1.5 rounded-lg hover:bg-white/10 text-on-glass-muted hover:text-on-glass transition-all"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => shareWhatsApp(tx)}
                              title="Send on WhatsApp"
                              className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-on-glass-muted hover:text-emerald-400 transition-all"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded items row */}
                      {expandedId === tx.transactionId && (
                        <tr key={`${tx.transactionId}-detail`} className="bg-charcoal-900/60">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Items */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted mb-2">Items Sold</p>
                                <div className="space-y-1.5">
                                  {tx.items.map((item, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                      <div>
                                        <span className="text-on-glass font-medium">{item.productName}</span>
                                        <span className="text-on-glass-muted ml-2">× {item.quantity}</span>
                                      </div>
                                      <span className="font-semibold text-on-glass tabular-nums">
                                        {Number(item.lineTotal).toLocaleString()} RWF
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Meta */}
                              <div className="space-y-2 text-sm">
                                <p className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted mb-2">Details</p>
                                {Number(tx.discountAmount) > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-on-glass-muted">Discount</span>
                                    <span className="text-emerald-400">− {Number(tx.discountAmount).toLocaleString()} RWF</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-on-glass-muted">Cashier</span>
                                  <span className="text-on-glass">{tx.cashierName}</span>
                                </div>
                                {tx.paymentReference && (
                                  <div className="flex justify-between">
                                    <span className="text-on-glass-muted">Reference</span>
                                    <span className="text-on-glass font-mono text-xs">{tx.paymentReference}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-white/10">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </div>
          </>
        )}
      </GlassCard>

      {/* Hidden receipt area for PDF/print generation */}
      {receiptTx && (
        <div
          id="history-receipt-area"
          className="fixed left-0 top-0 bg-white text-black font-sans opacity-0 print:opacity-100"
          style={{ width: '80mm', padding: '4mm', zIndex: -100, pointerEvents: 'none' }}
        >
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold uppercase tracking-tight">Quincaillerie du Rwamagana</h1>
            <p className="text-sm text-gray-600">Rwamagana, Eastern Province</p>
            <div className="mt-3 pt-3 border-t border-dashed border-gray-400 text-xs text-left">
              <p><strong>Receipt:</strong> #{receiptTx.transactionId.substring(3, 11).toUpperCase()}</p>
              <p><strong>Date:</strong> {new Date(receiptTx.transactionDate).toLocaleString()}</p>
              <p><strong>Cashier:</strong> {receiptTx.cashierName}</p>
            </div>
          </div>

          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-dashed border-gray-400">
                <th className="text-left py-1 font-semibold">Item</th>
                <th className="text-center py-1 font-semibold">Qty</th>
                <th className="text-right py-1 font-semibold">Price</th>
                <th className="text-right py-1 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {receiptTx.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-none">
                  <td className="py-1.5 pr-1 break-words">{item.productName}</td>
                  <td className="py-1.5 text-center">{item.quantity}</td>
                  <td className="py-1.5 text-right">{Number(item.unitPrice).toLocaleString()}</td>
                  <td className="py-1.5 text-right font-medium">{Number(item.lineTotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-gray-400 pt-2 mb-4 space-y-1">
            {Number(receiptTx.discountAmount) > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{(Number(receiptTx.totalAmount) + Number(receiptTx.discountAmount)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Discount</span>
                  <span>-{Number(receiptTx.discountAmount).toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-lg pt-1">
              <span>TOTAL</span>
              <span>{Number(receiptTx.totalAmount).toLocaleString()} RWF</span>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-400 pt-2 mb-6 text-xs space-y-1">
            <p className="flex justify-between">
              <span>Payment Method:</span>
              <span className="font-medium">{PM_LABELS[receiptTx.paymentMethod] ?? receiptTx.paymentMethod}</span>
            </p>
            {receiptTx.customerName && <p className="flex justify-between"><span>Customer:</span><span className="font-medium">{receiptTx.customerName}</span></p>}
            {receiptTx.customerPhone && <p className="flex justify-between"><span>Phone:</span><span className="font-medium">{receiptTx.customerPhone}</span></p>}
          </div>

          <div className="text-center text-xs border-t border-dashed border-gray-400 pt-4 pb-4">
            <p className="font-semibold text-sm">Thank you for your business!</p>
            <p className="text-gray-500 mt-1">Goods once sold are not returnable.</p>
          </div>
        </div>
      )}
    </div>
  )
}
