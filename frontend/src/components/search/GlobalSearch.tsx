import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Package, Search, Users, X } from 'lucide-react'
import { productApi } from '../../services/productApi'
import { customerApi } from '../../services/customerApi'
import type { ProductRecord } from '../../data/products'
import type { CustomerRecord } from '../../data/customers'
import type { Customer } from '../../types'
import { NAV_ITEMS } from '../../config/navigation'
import { ROUTES } from '../../config/routes'
import { GlassCard } from '../ui/GlassCard'
import { useAuth } from '../../contexts/AuthContext'

interface SearchResult {
  id: string
  type: 'product' | 'customer' | 'page' | 'report'
  name: string
  subtitle: string
  path: string
  icon: typeof Package
}

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
    isActive: true,
  }
}

export function GlobalSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.allSettled([productApi.getAll(), customerApi.getAll()])
      .then(([productsRes, customersRes]) => {
        if (productsRes.status === 'fulfilled') setProducts(productsRes.value)
        if (customersRes.status === 'fulfilled') setCustomers(customersRes.value.map(customerToRecord))
      })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setMobileExpanded(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMobileExpanded(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const items: SearchResult[] = []

    products.filter((p) => p.isActive && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))).slice(0, 5).forEach((p) => {
      items.push({ id: `p-${p.id}`, type: 'product', name: p.name, subtitle: p.sku, path: ROUTES.PRODUCTS, icon: Package })
    })

    customers.filter((c) => c.isActive && (c.name.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 5).forEach((c) => {
      items.push({ id: `c-${c.id}`, type: 'customer', name: c.name, subtitle: c.phone, path: ROUTES.CUSTOMER(c.id), icon: Users })
    })

    NAV_ITEMS.filter((n) => n.roles.includes(user?.role ?? 'viewer') && n.label.toLowerCase().includes(q)).slice(0, 4).forEach((n) => {
      items.push({ id: `nav-${n.path}`, type: 'page', name: n.label, subtitle: 'Navigation', path: n.path, icon: Search })
    })

    if ('sales summary'.includes(q) || 'report'.includes(q)) {
      items.push({ id: 'r-reports', type: 'report', name: 'Reports', subtitle: 'Reporting', path: ROUTES.REPORTS, icon: FileText })
    }

    return items
  }, [query, user?.role, products, customers])

  const grouped = useMemo(() => ({
    product: results.filter((r) => r.type === 'product'),
    customer: results.filter((r) => r.type === 'customer'),
    page: results.filter((r) => r.type === 'page'),
    report: results.filter((r) => r.type === 'report'),
  }), [results])

  const go = (path: string) => {
    navigate(path)
    setQuery('')
    setOpen(false)
    setMobileExpanded(false)
  }

  const showDropdown = open && query.trim().length > 0

  const openMobileSearch = () => {
    setMobileExpanded(true)
    setOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const closeMobileSearch = () => {
    setMobileExpanded(false)
    setOpen(false)
    setQuery('')
  }

  const dropdown = showDropdown ? (
    <GlassCard strong className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto p-2">
      {results.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-on-glass-muted">No results found</p>
      ) : (
        (['product', 'customer', 'page', 'report'] as const).map((group) => {
          const list = grouped[group]
          if (!list.length) return null
          const label = group === 'product' ? 'Products' : group === 'customer' ? 'Customers' : group === 'page' ? 'Pages' : 'Reports'
          return (
            <div key={group} className="mb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-on-glass-muted">{label}</p>
              {list.map((r) => {
                const Icon = r.icon
                return (
                  <button key={r.id} type="button" onClick={() => go(r.path)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
                    <Icon className="h-4 w-4 shrink-0 text-copper-light" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-on-glass">{r.name}</p>
                      <p className="truncate text-xs text-on-glass-muted">{r.subtitle}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })
      )}
    </GlassCard>
  ) : null

  return (
    <>
      {!mobileExpanded && (
        <button type="button" onClick={openMobileSearch} className="rounded-lg p-2 text-on-glass transition-colors hover:glass md:hidden" aria-label="Open search">
          <Search className="h-5 w-5" />
        </button>
      )}

      <div ref={containerRef} className={`relative min-w-0 ${mobileExpanded ? 'flex flex-1' : 'hidden md:flex md:flex-1 md:max-w-md lg:max-w-lg'}`}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search products, customers, pages..."
          className="glass-input h-9 w-full rounded-lg py-2 pl-9 pr-16 text-sm"
          aria-label="Global search"
          aria-expanded={showDropdown}
        />
        {mobileExpanded ? (
          <button type="button" onClick={closeMobileSearch} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-glass-muted hover:text-on-glass md:hidden" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-on-glass-muted lg:inline">Ctrl+K</kbd>
        )}
        {dropdown}
      </div>
    </>
  )
}
