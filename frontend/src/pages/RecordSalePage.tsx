import { useState, useEffect, useMemo } from 'react'
import { printReceiptPdf, downloadReceiptPdf } from '../utils/receiptPdf'
import { CheckoutModal } from '../components/modals/CheckoutModal'
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
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)

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
        return prev // Item is already in cart; user adjusts qty manually
      }
      if (product.quantityOnHand <= 0) return prev
      return [...prev, { productId: product.productId, productName: product.productName, unitPrice: product.unitPrice, quantity: 1 }]
    })
  }

  const updateCartQty = (productId: string, newQty: number | string) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.productId === productId)
        const maxQty = product?.quantityOnHand || 0
        
        let parsedQty = typeof newQty === 'string' ? parseInt(newQty, 10) : newQty
        if (isNaN(parsedQty)) parsedQty = 1
        
        const finalQty = Math.max(1, Math.min(parsedQty, maxQty))
        return { ...item, quantity: finalQty }
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

  const handleConfirmSale = async (paymentDetails: {
    paymentMethod: string
    paymentReference?: string
    discountAmount: number
    customerName: string
    customerPhone: string
    expectedPaymentDate?: string
  }) => {
    if (cart.length === 0) return
    try {
      const payload = {
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })),
        ...paymentDetails
      }

      const result = await salesApi.recordSale(payload) as { transactionId: string; transactionDate: string }
      setConfirmation({ 
        ...result, 
        cart, 
        total: Math.max(0, subtotal - paymentDetails.discountAmount), 
        discount: paymentDetails.discountAmount, 
        paymentMethod: paymentDetails.paymentMethod, 
        customerName: paymentDetails.customerName, 
        customerPhone: paymentDetails.customerPhone, 
        dueDate: paymentDetails.expectedPaymentDate || '' 
      })
      loadProducts()
      setIsCheckoutOpen(false)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record sale'
      alert((error as { response?: { data?: { message?: string } } })?.response?.data?.message || msg)
    }
  }

  const resetSale = () => {
    setCart([])
    setConfirmation(null)
  }

  const handlePrint = () => {
    if (!confirmation) return
    printReceiptPdf({
      transactionId: confirmation.transactionId,
      transactionDate: confirmation.transactionDate,
      cashierName: 'Administrator',
      customerName: confirmation.customerName,
      customerPhone: confirmation.customerPhone,
      paymentMethod: confirmation.paymentMethod,
      dueDate: confirmation.dueDate,
      totalAmount: confirmation.total,
      discountAmount: confirmation.discount,
      items: confirmation.cart.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
      })),
    })
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
      const methodLabel: Record<string, string> = {
        cash: 'Cash',
        mobile_money: 'MTN Mobile Money',
        airtel: 'Airtel Money',
        bank_transfer: 'Bank Transfer',
      }
      text += `✅ *PAID — ${methodLabel[paymentMethod] ?? paymentMethod}*\n\n`
    }

    if (customerName) text += `Customer: ${customerName}\n`
    if (customerPhone) text += `Phone: ${customerPhone}\n`
    if (isCredit && dueDate) text += `Due by: ${dueDate}\n`

    text += `\n_Thank you for your purchase!_`
    return text
  }

  const shareViaWhatsApp = async () => {
    if (!confirmation) return

    // 1. Generate and download PDF
    downloadReceiptPdf({
      transactionId: confirmation.transactionId,
      transactionDate: confirmation.transactionDate,
      cashierName: 'Administrator',
      customerName: confirmation.customerName,
      customerPhone: confirmation.customerPhone,
      paymentMethod: confirmation.paymentMethod,
      dueDate: confirmation.dueDate,
      totalAmount: confirmation.total,
      discountAmount: confirmation.discount,
      items: confirmation.cart.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
      })),
    })

    // 2. Send WhatsApp message
    const text = generateReceiptText()
    let phone = confirmation.customerPhone?.replace(/\D/g, '') || ''
    
    if (phone.length === 10 && phone.startsWith('0')) {
      phone = '250' + phone.substring(1)
    } else if (phone.length === 9 && phone.startsWith('7')) {
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
    const paidMethodLabel = paymentLabel[confirmation.paymentMethod] ?? confirmation.paymentMethod

    return (
      <div className="space-y-6 min-h-screen pb-10">
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
                    {isCredit ? 'CREDIT — PENDING' : `PAID · ${paidMethodLabel}`}
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
                  onClick={handlePrint}
                  className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Printer className="w-4 h-4" /> Print Receipt
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

                    {/* Qty stepper & input */}
                    <div className="flex items-center bg-charcoal-800 rounded-md border border-white/10 overflow-hidden shrink-0">
                      <button onClick={() => updateCartQty(item.productId, item.quantity - 1)} aria-label="Decrease" className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-on-glass">
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateCartQty(item.productId, e.target.value)}
                        className="w-8 text-center text-xs font-bold text-on-glass bg-transparent outline-none p-0 hide-spin-button"
                      />
                      <button onClick={() => updateCartQty(item.productId, item.quantity + 1)} aria-label="Increase" className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-on-glass">
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

          {/* TOTAL + PROCEED — always pinned at bottom */}
          <div className="shrink-0 border-t border-copper/20 bg-charcoal-900/60 px-4 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-on-glass-muted uppercase text-sm tracking-wider">Subtotal</span>
              <span className="text-2xl font-extrabold text-copper-light tabular-nums">{subtotal.toLocaleString()} <span className="text-sm font-semibold text-on-glass-muted">RWF</span></span>
            </div>
            <button
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full btn-primary py-3.5 font-bold text-base tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-copper/20"
            >
              PROCEED TO CHECKOUT
            </button>
          </div>

        </GlassCard>
      </div>

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        customers={customers}
        subtotal={subtotal}
        onConfirm={handleConfirmSale}
      />
    </div>
  )
}
