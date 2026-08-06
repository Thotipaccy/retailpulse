import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { ShoppingCart, Search, Printer, Phone, CheckCircle, AlertTriangle, Tag, User, Calendar, CreditCard, Minus, Plus, Trash2 } from 'lucide-react'
import { inventoryApi } from '../services/inventoryApi'
import { salesApi } from '../services/salesApi'
import { customerApi } from '../services/customerApi'
import type { StockItem } from '../types/api'
import type { Customer } from '../types'

interface CartItem {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
}

interface SaleConfirmation {
  transactionId: string
  transactionDate: string
  cart: CartItem[]
  total: number
  discount: number
  paymentMethod: string
  customerName: string
  customerPhone: string
  dueDate: string
}

export function RecordSalePage() {
  const [products, setProducts] = useState<StockItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<string>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueDate, setDueDate] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<SaleConfirmation | null>(null)

  const loadProducts = async () => {
    try {
      const data = await inventoryApi.getStockLevels()
      setProducts(data)
    } catch (error) {
      console.error('Failed to load products', error)
    }
  }

  useEffect(() => {
    void inventoryApi.getStockLevels().then(data => setProducts(data)).catch(console.error)
    void customerApi.search().then(data => setCustomers(data)).catch(console.error)
  }, [])

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category))
    return ['All', ...Array.from(cats)].sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || (p.skuCode ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [products, searchTerm, selectedCategory])

  const addToCart = (product: StockItem) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.productId)
      if (existing) {
        if (existing.quantity >= product.quantityOnHand) return prev
        return prev.map(item => item.productId === product.productId ? { ...item, quantity: item.quantity + 1 } : item)
      }
      if (product.quantityOnHand <= 0) return prev
      return [...prev, { productId: product.productId, productName: product.productName, unitPrice: product.unitPrice, quantity: 1 }]
    })
  }

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.productId === productId)
        const maxQty = product?.quantityOnHand || 0
        const newQty = Math.max(1, Math.min(item.quantity + delta, maxQty))
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  const updateCartPrice = (productId: string, newPrice: number) => {
    setCart(prev => prev.map(item =>
      item.productId === productId ? { ...item, unitPrice: Math.max(0, newPrice) } : item
    ))
  }

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const total = Math.max(0, subtotal - discount)

  const handleConfirmSale = async () => {
    if (cart.length === 0) return
    if (paymentMethod === 'credit' && (!customerName || !customerPhone)) {
      alert('Customer name and phone are required for credit sales.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })),
        paymentMethod,
        paymentReference: ['mobile_money', 'airtel', 'bank_transfer'].includes(paymentMethod) ? paymentReference : undefined,
        discountAmount: discount,
        customerName,
        customerPhone,
        expectedPaymentDate: paymentMethod === 'credit' && dueDate ? dueDate : undefined
      }

      const result = await salesApi.recordSale(payload)
      setConfirmation({ ...result, cart, total, discount, paymentMethod, customerName, customerPhone, dueDate })
      loadProducts()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record sale'
      alert((error as { response?: { data?: { message?: string } } })?.response?.data?.message || msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetSale = () => {
    setCart([])
    setDiscount(0)
    setPaymentMethod('cash')
    setPaymentReference('')
    setCustomerName('')
    setCustomerPhone('')
    setDueDate('')
    setConfirmation(null)
  }

  const generateReceiptText = () => {
    if (!confirmation) return ''
    const { transactionId, transactionDate, cart, total, paymentMethod, customerName, customerPhone, dueDate } = confirmation
    const isCredit = paymentMethod === 'credit'

    let text = `*Quincaillerie du Rwamagana*\nRwamagana, Eastern Province\n\n*RECEIPT #${transactionId.substring(0, 8).toUpperCase()}*\n${new Date(transactionDate).toLocaleString()}\n\n`
    cart.forEach((item: CartItem) => {
      text += `${item.productName}\n  ${item.quantity} × ${item.unitPrice.toLocaleString()} = ${(item.quantity * item.unitPrice).toLocaleString()} RWF\n`
    })
    text += `─────────────────────────\n*TOTAL: ${total.toLocaleString()} RWF*\n\n`

    if (isCredit) {
      text += `⚠️ *CREDIT — PAYMENT PENDING*\n\n`
    } else {
      text += `✅ *PAID — ${paymentMethod.toUpperCase()}*\n\n`
    }

    if (customerName) text += `Customer: ${customerName}\n`
    if (customerPhone) text += `Phone: ${customerPhone}\n`
    if (isCredit && dueDate) text += `Due by: ${dueDate}\n`

    text += `\n_Thank you for your purchase!_`
    return text
  }

  const shareViaWhatsApp = () => {
    if (!confirmation) return
    const text = generateReceiptText()
    let phone = confirmation.customerPhone?.replace(/\D/g, '') || ''
    
    // Auto-format local Rwandan numbers starting with 0
    if (phone.length === 10 && phone.startsWith('0')) {
      phone = '250' + phone.substring(1)
    }
    // Auto-format local Rwandan numbers starting with 7
    else if (phone.length === 9 && phone.startsWith('7')) {
      phone = '250' + phone
    }

    const url = phone 
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  // ─── CONFIRMATION SCREEN ───────────────────────────────────────────────────
  if (confirmation) {
    const isCredit = confirmation.paymentMethod === 'credit'
    const paymentLabel: Record<string, string> = {
      cash: 'Cash',
      mobile_money: 'MTN Mobile Money',
      airtel: 'Airtel Money',
      bank_transfer: 'Bank Transfer',
      credit: 'Credit',
    }

    return (
      <>
        {/* ─── ON-SCREEN CONFIRMATION ─── */}
        <div className="space-y-6 min-h-screen pb-10 print:hidden">
          <PageHeader title="Record Sale" description="Direct sales processing" />

        <div className="max-w-2xl mx-auto px-2">
          <GlassCard strong className="overflow-hidden">
            {/* Header Banner */}
            <div className={`px-8 py-7 text-center ${isCredit
              ? 'bg-gradient-to-br from-amber-600/20 via-amber-500/10 to-transparent border-b border-amber-500/20'
              : 'bg-gradient-to-br from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-emerald-500/20'
            }`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${isCredit ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {isCredit ? <AlertTriangle className="w-10 h-10" /> : <CheckCircle className="w-10 h-10" />}
              </div>
              <h2 className={`text-2xl font-bold mb-1 ${isCredit ? 'text-amber-300' : 'text-emerald-300'}`}>
                {isCredit ? 'CREDIT SALE RECORDED' : 'SALE COMPLETED'}
              </h2>
              <p className="text-on-glass-muted text-sm">
                Receipt #{confirmation.transactionId?.substring(0, 8).toUpperCase() ?? 'N/A'} &nbsp;·&nbsp; {new Date(confirmation.transactionDate).toLocaleString()}
              </p>
            </div>

            <div className="p-8 space-y-6">
              {/* Items list */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted mb-3">Items Sold</p>
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 text-on-glass-muted">
                        <th className="text-left px-4 py-2.5 font-medium">Product</th>
                        <th className="text-center px-4 py-2.5 font-medium">Qty</th>
                        <th className="text-right px-4 py-2.5 font-medium">Unit Price</th>
                        <th className="text-right px-4 py-2.5 font-medium">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmation.cart.map((item: CartItem, i: number) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/3 transition-colors">
                          <td className="px-4 py-3 text-on-glass font-medium">{item.productName}</td>
                          <td className="px-4 py-3 text-center text-on-glass-muted">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-on-glass-muted">{item.unitPrice.toLocaleString()} RWF</td>
                          <td className="px-4 py-3 text-right font-semibold text-on-glass">{(item.quantity * item.unitPrice).toLocaleString()} RWF</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-xl border border-copper/20 bg-copper/5 p-5 space-y-2">
                {confirmation.discount > 0 && (
                  <div className="flex justify-between text-sm text-on-glass-muted">
                    <span>Subtotal</span>
                    <span>{(confirmation.total + confirmation.discount).toLocaleString()} RWF</span>
                  </div>
                )}
                {confirmation.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Discount</span>
                    <span>− {confirmation.discount.toLocaleString()} RWF</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold border-t border-white/10 pt-3 mt-1">
                  <span className="text-on-glass">TOTAL</span>
                  <span className="text-copper-light">{confirmation.total.toLocaleString()} RWF</span>
                </div>
              </div>

              {/* Payment & Customer info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Payment</p>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${isCredit ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}`}>
                    {isCredit ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {isCredit ? 'CREDIT — PENDING' : `PAID · ${paymentLabel[confirmation.paymentMethod] ?? confirmation.paymentMethod}`}
                  </div>
                  {confirmation.dueDate && isCredit && (
                    <p className="text-sm text-on-glass-muted flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-amber-400" /> Due: <span className="text-on-glass font-medium">{confirmation.dueDate}</span></p>
                  )}
                </div>

                {confirmation.customerName ? (
                  <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-on-glass-muted flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Customer</p>
                    <p className="text-on-glass font-medium">{confirmation.customerName}</p>
                    {confirmation.customerPhone && <p className="text-sm text-on-glass-muted">{confirmation.customerPhone}</p>}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/5 bg-white/2 p-4 flex items-center justify-center text-on-glass-muted text-sm opacity-50">
                    Walk-in customer
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </button>
                <button
                  onClick={shareViaWhatsApp}
                  className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2 text-sm bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border-emerald-500/30"
                >
                  <Phone className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  onClick={resetSale}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> New Sale
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

        {/* ─── THERMAL RECEIPT PRINT LAYOUT ─── */}
        <div className="hidden print:block bg-white text-black font-sans mx-auto" style={{ width: '80mm', padding: '4mm' }}>
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold uppercase tracking-tight">Quincaillerie du Rwamagana</h1>
            <p className="text-sm text-gray-600">Rwamagana, Eastern Province</p>
            <div className="mt-3 pt-3 border-t border-dashed border-gray-400 text-xs text-left">
              <p><strong>Receipt:</strong> #{confirmation.transactionId?.substring(0, 8).toUpperCase()}</p>
              <p><strong>Date:</strong> {new Date(confirmation.transactionDate).toLocaleString()}</p>
              <p><strong>Cashier:</strong> Administrator</p>
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
              {confirmation.cart.map((item: CartItem, i: number) => (
                <tr key={i} className="border-b border-gray-100 last:border-none">
                  <td className="py-1.5 pr-1 break-words">{item.productName}</td>
                  <td className="py-1.5 text-center">{item.quantity}</td>
                  <td className="py-1.5 text-right">{item.unitPrice.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-medium">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-gray-400 pt-2 mb-4 space-y-1">
            {confirmation.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{(confirmation.total + confirmation.discount).toLocaleString()}</span>
              </div>
            )}
            {confirmation.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span>Discount</span>
                <span>-{confirmation.discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-1">
              <span>TOTAL</span>
              <span>{confirmation.total.toLocaleString()} RWF</span>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-400 pt-2 mb-6 text-xs space-y-1">
            <p className="flex justify-between"><span>Payment Method:</span> <span className="font-medium">{paymentLabel[confirmation.paymentMethod] ?? confirmation.paymentMethod}</span></p>
            {confirmation.customerName && <p className="flex justify-between"><span>Customer:</span> <span className="font-medium">{confirmation.customerName}</span></p>}
            {confirmation.customerPhone && <p className="flex justify-between"><span>Phone:</span> <span className="font-medium">{confirmation.customerPhone}</span></p>}
            {confirmation.dueDate && isCredit && <p className="flex justify-between text-red-600 font-bold"><span>Due by:</span> <span>{confirmation.dueDate}</span></p>}
          </div>

          <div className="text-center text-xs border-t border-dashed border-gray-400 pt-4 pb-4">
            <p className="font-semibold text-sm">Thank you for your business!</p>
            <p className="text-gray-500 mt-1">Goods once sold are not returnable.</p>
          </div>
        </div>
      </>
    )
  }

  // ─── MAIN POS SCREEN ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4 h-[calc(100vh-100px)] flex flex-col">
      <PageHeader title="Record Sale" description="Direct sales processing" />

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* LEFT PANEL: Products */}
        <GlassCard strong className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
          {/* Search & Filter bar */}
          <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-glass-muted" />
              <input
                type="text"
                placeholder="Search by name or SKU…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-charcoal-900/60 border border-white/10 rounded-xl text-on-glass text-sm focus:border-copper focus:ring-1 focus:ring-copper/40 outline-none transition-all placeholder:text-on-glass-muted"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${selectedCategory === cat
                    ? 'bg-copper text-white shadow-lg shadow-copper/20'
                    : 'bg-white/5 text-on-glass hover:bg-white/10 border border-white/10'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-4 content-start flex-1">
            {filteredProducts.map(product => (
              <button
                key={product.productId}
                onClick={() => addToCart(product)}
                disabled={product.quantityOnHand <= 0}
                title={product.productName}
                className={`text-left p-5 rounded-2xl border transition-all group flex flex-col min-h-[160px] ${
                  product.quantityOnHand > 0
                    ? 'border-white/10 bg-white/4 hover:border-copper/60 hover:bg-copper/8 hover:shadow-lg hover:shadow-copper/10 active:scale-[0.98]'
                    : 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                }`}
              >
                {/* Category chip */}
                <div className="text-[11px] font-bold text-copper-light mb-2 uppercase tracking-widest truncate">{product.category}</div>

                {/* Product name — large and readable */}
                <div className="font-bold text-on-glass text-base leading-snug mb-auto line-clamp-3 min-h-[3.5rem]">{product.productName}</div>

                {/* Bottom: price + stock */}
                <div className="mt-3 space-y-1.5">
                  <div className="text-xl font-extrabold text-on-glass">
                    {product.unitPrice.toLocaleString()}
                    <span className="text-xs font-semibold text-on-glass-muted ml-1">RWF</span>
                  </div>
                  <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    product.quantityOnHand > 5
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : product.quantityOnHand > 0
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-rust/15 text-rust'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      product.quantityOnHand > 5 ? 'bg-emerald-400' : product.quantityOnHand > 0 ? 'bg-amber-400' : 'bg-rust'
                    }`} />
                    {product.quantityOnHand > 0 ? `${product.quantityOnHand} in stock` : 'Out of stock'}
                  </div>
                </div>

                {/* Hover tap hint */}
                {product.quantityOnHand > 0 && (
                  <div className="mt-2 text-[11px] text-copper-light/60 group-hover:text-copper-light transition-colors font-medium">Tap to add →</div>
                )}
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-16 text-center text-on-glass-muted">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No products match your search.</p>
              </div>
            )}
          </div>
        </GlassCard>

        {/* RIGHT PANEL: Cart */}
        <GlassCard strong className="w-full lg:w-[460px] flex flex-col min-h-0 shrink-0 p-0 overflow-hidden">

          {/* Cart header */}
          <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center shrink-0 bg-white/3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-copper-light" />
              <h3 className="font-bold text-on-glass tracking-wide">CURRENT SALE</h3>
            </div>
            <span className="text-xs font-semibold bg-copper/20 text-copper-light px-2.5 py-1 rounded-full border border-copper/20">
              {cart.length} {cart.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Cart items — compact single-line rows, min 3 visible */}
          <div className="overflow-y-auto px-3 py-2 space-y-1 flex-1 min-h-[120px]">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-on-glass-muted opacity-40 gap-2 py-8 h-full">
                <ShoppingCart className="w-10 h-10" />
                <p className="text-xs">Tap a product to add it here</p>
              </div>
            ) : (
              // Header row
              <>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 items-center px-1 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-glass-muted">Product</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-glass-muted text-center w-[76px]">Qty</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-glass-muted text-right w-20">Price</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-glass-muted text-right w-20">Total</span>
                  <span className="w-6" />
                </div>
                {cart.map((item) => (
                  <div key={item.productId} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 items-center py-1.5 px-1 rounded-lg hover:bg-white/4 transition-colors border-b border-white/5 last:border-0">
                    {/* Name */}
                    <span className="text-sm font-medium text-on-glass truncate pr-1" title={item.productName}>{item.productName}</span>

                    {/* Qty stepper */}
                    <div className="flex items-center bg-charcoal-800 rounded-md border border-white/10 overflow-hidden shrink-0">
                      <button onClick={() => updateCartQty(item.productId, -1)} aria-label="Decrease" className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-on-glass">
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-on-glass">{item.quantity}</span>
                      <button onClick={() => updateCartQty(item.productId, 1)} aria-label="Increase" className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-on-glass">
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* Editable unit price */}
                    <div className="relative w-20 shrink-0">
                      <input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={e => updateCartPrice(item.productId, Number(e.target.value))}
                        title="Selling price (editable)"
                        aria-label={`Unit price for ${item.productName}`}
                        className="w-full px-1.5 py-1 bg-charcoal-800 border border-copper/30 rounded-md text-xs font-semibold text-on-glass text-right focus:border-copper focus:ring-1 focus:ring-copper/30 outline-none"
                      />
                    </div>

                    {/* Line total */}
                    <span className="text-xs font-bold text-on-glass text-right w-20 shrink-0 tabular-nums">
                      {(item.quantity * item.unitPrice).toLocaleString()}
                    </span>

                    {/* Remove */}
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      title={`Remove ${item.productName}`}
                      aria-label={`Remove ${item.productName}`}
                      className="w-6 h-6 flex items-center justify-center text-on-glass-muted hover:text-rust hover:bg-rust/10 rounded transition-all shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bottom panel: payment options — scrollable */}
          <div className="shrink-0 border-t border-white/10 bg-charcoal-900/40 divide-y divide-white/5 overflow-y-auto max-h-[40vh] md:max-h-[35vh]">

            {/* Subtotal / Discount */}
            <div className="px-4 py-2 space-y-1.5 text-sm">
              <div className="flex justify-between text-on-glass-muted">
                <span>Subtotal</span>
                <span className="font-medium text-on-glass">{subtotal.toLocaleString()} RWF</span>
              </div>
              <div className="flex justify-between items-center text-on-glass-muted">
                <label htmlFor="discount-input" className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-emerald-400" /> Discount (RWF)</label>
                <input
                  id="discount-input"
                  type="number"
                  min={0}
                  value={discount || ''}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="0"
                  className="w-24 px-2 py-1 bg-charcoal-800 border border-white/10 rounded-lg text-right text-sm font-medium text-on-glass focus:border-copper outline-none"
                />
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-400 text-xs font-medium">
                  <span>You save</span>
                  <span>− {discount.toLocaleString()} RWF</span>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="px-4 py-2 space-y-1.5">
              <label htmlFor="payment-method" className="block text-xs font-semibold text-on-glass-muted uppercase tracking-wider">Payment Method</label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                aria-label="Payment Method"
                title="Payment Method"
                className="w-full px-3 py-2 bg-charcoal-800 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none appearance-none cursor-pointer"
              >
                <option value="cash">💵  Cash (RWF)</option>
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
                  className="w-full px-3 py-2 bg-charcoal-800 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none"
                />
              )}
            </div>

            {/* Customer info */}
            <div className="px-4 py-2 space-y-1.5">
              <label className="block text-xs font-semibold text-on-glass-muted uppercase tracking-wider">
                Customer Details {paymentMethod === 'credit' && <span className="text-rust ml-1">* Required</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <datalist id="customer-names">
                  {customers.map(c => <option key={c.customerId} value={c.customerName} />)}
                </datalist>
                <datalist id="customer-phones">
                  {customers.filter(c => c.phone).map(c => <option key={c.customerId} value={c.phone} />)}
                </datalist>

                <input
                  type="text"
                  list="customer-names"
                  placeholder="Customer name"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value)
                    const match = customers.find(c => c.customerName.toLowerCase() === e.target.value.toLowerCase())
                    if (match && match.phone && !customerPhone) setCustomerPhone(match.phone)
                  }}
                  className="w-full px-3 py-2 bg-charcoal-800 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none placeholder:text-on-glass-muted"
                />
                <input
                  type="text"
                  list="customer-phones"
                  placeholder="Phone number"
                  value={customerPhone}
                  onChange={e => {
                    setCustomerPhone(e.target.value)
                    const match = customers.find(c => c.phone && c.phone === e.target.value)
                    if (match && !customerName) setCustomerName(match.customerName)
                  }}
                  className="w-full px-3 py-2 bg-charcoal-800 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none placeholder:text-on-glass-muted"
                />
              </div>
              {paymentMethod === 'credit' && (
                <input
                  type="date"
                  title="Expected payment due date"
                  aria-label="Expected payment due date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-charcoal-800 border border-white/10 rounded-xl text-sm text-on-glass focus:border-copper outline-none"
                />
              )}
            </div>
          </div>

          {/* TOTAL + CONFIRM — always pinned at bottom, never scrolled away */}
          <div className="shrink-0 border-t border-copper/20 bg-charcoal-900/60 px-4 py-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-on-glass-muted uppercase text-sm tracking-wider">Total</span>
              <span className="text-2xl font-extrabold text-copper-light tabular-nums">{total.toLocaleString()} <span className="text-sm font-semibold text-on-glass-muted">RWF</span></span>
            </div>
            <button
              onClick={handleConfirmSale}
              disabled={cart.length === 0 || isSubmitting}
              className="w-full btn-primary py-3 font-bold text-base tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  PROCESSING…
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  CONFIRM SALE
                </>
              )}
            </button>
          </div>

        </GlassCard>
      </div>
    </div>
  )
}
