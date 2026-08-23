import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Package, Plus, Search, ShoppingCart } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { inventoryApi } from '../services/inventoryApi'
import { formatRWF } from '../utils/format'
import { CHART_GRID, CHART_TICK, CHART_TOOLTIP } from '../components/ui/chartTheme'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { PurchaseOrderModal, type POItem } from '../components/modals/PurchaseOrderModal'
import { RecordPurchaseModal, type PurchaseLinePrefill } from '../components/modals/RecordPurchaseModal'
import { ProductPurchaseHistoryModal } from '../components/modals/ProductPurchaseHistoryModal'
import { useToast } from '../contexts/ToastContext'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchInventoryExportData } from '../services/exportDataService'
import { GlassCard } from '../components/ui/GlassCard'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { EmptyState, ErrorState, LoadingSkeleton, ConfirmModal } from '../components/ui/PageHeader'
import { getErrorMessage } from '../services/api'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatusBadge, getStockStatusBadge } from '../components/ui/StatusBadge'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { Pagination } from '../components/ui/Pagination'
import type { InventorySummary, StockItem } from '../types/api'

const FOREST = '#3d7a5c'

interface StockCard extends StockItem {
  daysUntilStockout: number
  stockValue: number
  fillPct: number
  unitCost?: number
  latestSupplier?: string
  cheapestSupplier?: string
}

interface RiskCard {
  productName: string
  category: string
  quantityOnHand: number
  daysLeft: number
  level: 'CRITICAL' | 'HIGH'
}

interface ReorderRow extends StockItem {
  priority: 'URGENT' | 'HIGH' | 'MEDIUM'
  orderQty: number
  estCost: number
  isActive: boolean
  supplierInsight?: string
  latestSupplier?: string
  cheapestSupplier?: string
  unitCost?: number
}

function estimateDaysUntilStockout(item: StockItem): number {
  if (item.quantityOnHand === 0) return 0
  const dailyUsage = Math.max(item.reorderPoint / 7, 1)
  return Math.max(1, Math.round(item.quantityOnHand / dailyUsage))
}

function toStockCard(item: StockItem): StockCard {
  const maxQty = Math.max(item.reorderPoint * 2, item.quantityOnHand, 1)
  const fillPct = Math.round((item.quantityOnHand / maxQty) * 100)
  const days = item.daysUntilStockout ?? estimateDaysUntilStockout(item)
  const r = (item as unknown) as Record<string, unknown>
  return {
    ...item,
    daysUntilStockout: days,
    stockValue: item.quantityOnHand * Number(r.unitCost ?? item.unitPrice),
    fillPct: Math.min(100, fillPct),
    unitCost: Number(r.unitCost ?? 0),
    latestSupplier: r.latestSupplier as string | undefined,
    cheapestSupplier: r.cheapestSupplier as string | undefined,
  }
}

function toRiskCard(item: StockItem): RiskCard {
  const daysLeft = item.daysUntilStockout ?? estimateDaysUntilStockout(item)
  return {
    productName: item.productName,
    category: item.category,
    quantityOnHand: item.quantityOnHand,
    daysLeft,
    level: item.stockStatus === 'critical' || item.quantityOnHand === 0 || (item.stockoutRisk ?? 0) > 0.7 ? 'CRITICAL' : 'HIGH',
  }
}

function toReorderRow(item: StockItem): ReorderRow {
  const r = (item as unknown) as Record<string, unknown>
  const unitCost = Number(r.unitCost ?? item.unitPrice ?? 0)
  const orderQty = item.suggestedOrder ?? Math.max(item.reorderPoint * 2 - item.quantityOnHand, item.reorderPoint)
  return {
    ...item,
    priority: item.stockStatus === 'critical' ? 'URGENT' : item.stockStatus === 'low' ? 'HIGH' : 'MEDIUM',
    orderQty,
    estCost: orderQty * unitCost,
    isActive: true,
    supplierInsight: item.supplierInsight,
    latestSupplier: r.latestSupplier as string | undefined,
    cheapestSupplier: r.cheapestSupplier as string | undefined,
    unitCost,
  }
}

function getPriorityBadge(priority: string) {
  if (priority === 'URGENT' || priority === 'CRITICAL') return <StatusBadge variant="danger">{priority}</StatusBadge>
  if (priority === 'HIGH') return <StatusBadge variant="warning">HIGH</StatusBadge>
  return <StatusBadge variant="info">{priority}</StatusBadge>
}

export function InventoryAnalyticsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [recordPurchaseOpen, setRecordPurchaseOpen] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<StockCard | null>(null)
  const [autoReorderOpen, setAutoReorderOpen] = useState(false)
  const [autoReordering, setAutoReordering] = useState(false)
  const [deactivateProduct, setDeactivateProduct] = useState<ReorderRow | null>(null)
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [turnover, setTurnover] = useState<{ name: string; turnover: number; cogs: number; inventoryValue: number }[]>([])
  const [stockCards, setStockCards] = useState<StockCard[]>([])
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(8)
  const [bestTimePage, setBestTimePage] = useState(1)
  const [bestTimePageSize, setBestTimePageSize] = useState(6)
  const [riskPage, setRiskPage] = useState(1)
  const [riskPageSize, setRiskPageSize] = useState(6)
  const [reorderPage, setReorderPage] = useState(1)
  const [reorderPageSize, setReorderPageSize] = useState(10)
  const [pendingPoPage, setPendingPoPage] = useState(1)
  const [pendingPoPageSize, setPendingPoPageSize] = useState(5)
  const [risks, setRisks] = useState<RiskCard[]>([])
  const [riskDays, setRiskDays] = useState<7 | 14 | 30>(7)
  const [reorders, setReorders] = useState<ReorderRow[]>([])
  const [velocity, setVelocity] = useState<Array<{ category: string; unitsSold: number; type: string }>>([])
  const [stockSearch, setStockSearch] = useState('')
  const [stockCategoryFilter, setStockCategoryFilter] = useState('all')
  const [riskSearch, setRiskSearch] = useState('')
  const [riskLevelFilter, setRiskLevelFilter] = useState<'all' | 'CRITICAL' | 'HIGH'>('all')
  const [reorderSearch, setReorderSearch] = useState('')
  const [reorderPriorityFilter, setReorderPriorityFilter] = useState<'all' | 'URGENT' | 'HIGH' | 'MEDIUM'>('all')
  const [reorderStatusFilter, setReorderStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [purchasePrefill, setPurchasePrefill] = useState<PurchaseLinePrefill[] | undefined>()
  const [pendingPOs, setPendingPOs] = useState<Array<{
    orderId: string
    status: string
    totalAmount: number
    createdAt: string
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; supplier: string }>
  }>>([])
  
  const [purchasePrefillSupplier, setPurchasePrefillSupplier] = useState<string | undefined>()
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | undefined>()
  const [bestTimeSuggestions, setBestTimeSuggestions] = useState<Array<{ productName: string; bestMonth?: string; avgUnitCost?: number; supplier?: string }>>([])  

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    Promise.allSettled([
      inventoryApi.getSummary(),
      inventoryApi.getTurnover(),
      inventoryApi.getStockLevels(),
      inventoryApi.getStockoutRisks(),
      inventoryApi.getReorderRecommendations(),
      inventoryApi.getVelocity(),
      inventoryApi.getPendingPurchaseOrders(),
    ])
      .then(([summaryRes, turnoverRes, stockRes, risksRes, reorderRes, velocityRes, pendingRes]) => {
        if (cancelled) return
        const failed = [summaryRes, turnoverRes, stockRes, risksRes, reorderRes, velocityRes].filter((r) => r.status === 'rejected')
        if (failed.length === 6) {
          setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
          return
        }
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)
        if (turnoverRes.status === 'fulfilled') {
          const raw = turnoverRes.value as unknown as Array<{ name: string; turnover?: number; value?: number; cogs?: number; inventoryValue?: number }>
          setTurnover(raw.map((p) => ({
            name: p.name,
            turnover: Number(p.turnover ?? p.value ?? 0),
            cogs: Number(p.cogs ?? 0),
            inventoryValue: Number(p.inventoryValue ?? 0),
          })))
        }
        if (stockRes.status === 'fulfilled') {
          setStockCards(stockRes.value.map(toStockCard))
        }
        if (risksRes.status === 'fulfilled') {
          setRisks(risksRes.value.map(toRiskCard))
        }
        if (reorderRes.status === 'fulfilled') {
          setReorders(reorderRes.value.map(toReorderRow))
        }
        if (velocityRes.status === 'fulfilled') {
          const fast = velocityRes.value.fastMovers.map((m) => ({ ...m, type: 'Fast' }))
          const slow = velocityRes.value.slowMovers.map((m) => ({ ...m, type: 'Slow' }))
          setVelocity([...fast, ...slow])
        }
        if (pendingRes.status === 'fulfilled') setPendingPOs(pendingRes.value)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      load()
    })()
    return () => { cancelled = true; void cancelled }
  }, [load])

  useEffect(() => {
    if (stockCards.length === 0) {
      setTimeout(() => setBestTimeSuggestions([]), 0)
      return
    }
    let cancelled = false
    const fetchAll = async () => {
      const results: Array<{ productName: string; bestMonth?: string; avgUnitCost?: number; supplier?: string }> = []
      for (const card of stockCards) {
        if (cancelled) return
        try {
          const res = await inventoryApi.getBestTimeToBuy(card.productId)
          if (!cancelled && res.available) {
            results.push({
              productName: card.productName,
              bestMonth: res.bestMonth,
              avgUnitCost: res.avgUnitCost,
              supplier: res.recommendedSupplier,
            })
          }
        } catch {
          // skip products with no data
        }
      }
      if (!cancelled) setBestTimeSuggestions(results)
    }
    void fetchAll()
    return () => { cancelled = true }
  }, [stockCards])

  const filteredRisks = useMemo(() => {
    let result = risks.filter(r => r.daysLeft <= riskDays)
    if (riskLevelFilter !== 'all') {
      result = result.filter(r => r.level === riskLevelFilter)
    }
    const q = riskSearch.trim().toLowerCase()
    if (q) {
      result = result.filter(r => 
        r.productName.toLowerCase().includes(q) || 
        r.category.toLowerCase().includes(q)
      )
    }
    return result
  }, [risks, riskDays, riskLevelFilter, riskSearch])

  const filteredReorders = useMemo(() => {
    let result = reorders
    if (reorderStatusFilter === 'active') result = result.filter(r => r.isActive)
    if (reorderStatusFilter === 'inactive') result = result.filter(r => !r.isActive)
    if (reorderPriorityFilter !== 'all') result = result.filter(r => r.priority === reorderPriorityFilter)
    
    const q = reorderSearch.trim().toLowerCase()
    if (q) {
      result = result.filter(r => 
        r.productName.toLowerCase().includes(q) || 
        r.category.toLowerCase().includes(q) ||
        (r.skuCode ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [reorders, reorderStatusFilter, reorderPriorityFilter, reorderSearch])

  const stockCategories = useMemo(
    () => Array.from(new Set(stockCards.map((c) => c.category).filter(Boolean))).sort(),
    [stockCards],
  )

  const filteredStockCards = useMemo(() => {
    const q = stockSearch.trim().toLowerCase()
    return stockCards.filter((c) => {
      if (stockCategoryFilter !== 'all' && c.category !== stockCategoryFilter) return false
      if (!q) return true
      return c.productName.toLowerCase().includes(q)
        || c.category.toLowerCase().includes(q)
        || (c.skuCode ?? '').toLowerCase().includes(q)
    })
  }, [stockCards, stockSearch, stockCategoryFilter])

  if (loading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const totalProducts = summary?.totalProducts ?? 0
  const inStockPct = totalProducts ? Math.round(((summary?.healthy ?? 0) / totalProducts) * 100) : 0
  const lowPct = totalProducts ? Math.round(((summary?.low ?? 0) / totalProducts) * 100) : 0
  const totalValue = stockCards.reduce((sum, c) => sum + c.stockValue, 0)
  const startIndex = (stockPage - 1) * stockPageSize
  const endIndex = Math.min(filteredStockCards.length, startIndex + stockPageSize)
  const paginatedStockCards = filteredStockCards.slice(startIndex, endIndex)
  
  const bestTimeStartIndex = (bestTimePage - 1) * bestTimePageSize
  const paginatedBestTime = bestTimeSuggestions.slice(bestTimeStartIndex, bestTimeStartIndex + bestTimePageSize)

  const riskStartIndex = (riskPage - 1) * riskPageSize
  const paginatedRisks = filteredRisks.slice(riskStartIndex, riskStartIndex + riskPageSize)

  const reorderStartIndex = (reorderPage - 1) * reorderPageSize
  const paginatedReorders = filteredReorders.slice(reorderStartIndex, reorderStartIndex + reorderPageSize)

  const pendingPoStartIndex = (pendingPoPage - 1) * pendingPoPageSize
  const paginatedPendingPOs = pendingPOs.slice(pendingPoStartIndex, pendingPoStartIndex + pendingPoPageSize)

  const activeReorders = reorders.filter((r) => r.isActive)
  const reorderTotal = activeReorders.reduce((sum, r) => sum + r.estCost, 0)

  const poItems: POItem[] = activeReorders.map((r) => ({
    id: r.productId,
    productId: r.productId,
    productName: r.productName,
    sku: r.skuCode ?? '—',
    quantity: r.orderQty,
    unitCost: Number(r.unitCost ?? r.unitPrice),
    supplier: r.latestSupplier ?? r.cheapestSupplier ?? 'Unknown Supplier',
  }))

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={Package}
        title="Inventory Analytics"
        subtitle="Stock levels, turnover velocity, and reorder intelligence"
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRecordPurchaseOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-copper/40 bg-copper/10 px-4 py-2 text-sm font-medium text-copper-light hover:bg-copper/20">
              <Plus className="h-4 w-4" />
              Record Purchase
            </button>
            <button type="button" onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>
        )}
      />

      {summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TintedKPICard label="In Stock" value={summary.healthy.toLocaleString()} subtitle={`${inStockPct}% of catalog`} tint="forest" trend={<p className="mt-1 text-xs text-forest-light">Healthy inventory levels</p>} />
          <TintedKPICard label="Low Stock" value={summary.low.toLocaleString()} subtitle={`${lowPct}% of catalog`} tint="ochre" trend={<p className="mt-1 text-xs text-ochre">Needs attention soon</p>} />
          <TintedKPICard label="Out of Stock" value={summary.critical} subtitle="Urgent restock required" tint="red" trend={<p className="mt-1 text-xs text-rust-light">Immediate action needed</p>} />
          <TintedKPICard label="Total Value" value={formatRWF(totalValue)} subtitle="Inventory at cost" tint="copper" />
        </div>
      ) : (
        <EmptyState icon={<Package className="h-6 w-6" />} title="No inventory summary" description="Inventory summary data is not available." />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Inventory Turnover Rate</h3>
          <p className="mb-1 text-sm text-on-glass-muted">How many times stock was sold &amp; replaced (last 90 days). Higher is better.</p>
          {turnover.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="No turnover data" description="Record sales transactions to calculate turnover." />
          ) : (
            <div data-export-chart data-export-chart-title="Inventory Turnover Rate">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={turnover} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="name" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} domain={[0, 'auto']} tickFormatter={(v) => `${v}x`} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    formatter={(v, _name, entry) => {
                      const d = entry?.payload as { cogs?: number; inventoryValue?: number } | undefined
                      const detail = (d?.cogs != null && d?.inventoryValue != null)
                        ? ` · COGS ${formatRWF(d.cogs)} / Stock ${formatRWF(d.inventoryValue)}`
                        : ''
                      return [`${Number(v).toFixed(1)}x${detail}`, 'Turnover Rate']
                    }}
                  />
                  <Bar dataKey="turnover" name="Turnover Rate" fill={FOREST} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-center text-xs text-on-glass-muted">Formula: COGS ÷ Current Inventory Value</p>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Fast vs Slow Movers</h3>
          <p className="mb-4 text-sm text-on-glass-muted">Units sold by category (last 30 days)</p>
          {velocity.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="No velocity data" description="Fast vs slow mover analytics are not available." />
          ) : (
            <div data-export-chart data-export-chart-title="Fast vs Slow Movers">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={velocity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="category" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
                  <Bar dataKey="unitsSold" name="Units Sold" fill={FOREST} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-on-glass">Stock Level Monitoring</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
              <input
                type="search"
                value={stockSearch}
                onChange={(e) => { setStockSearch(e.target.value); setStockPage(1) }}
                placeholder="Search products..."
                className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-sm sm:w-56"
              />
            </div>
            <select
              value={stockCategoryFilter}
              onChange={(e) => { setStockCategoryFilter(e.target.value); setStockPage(1) }}
              title="Filter by category"
              className="glass-input rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Categories</option>
              {stockCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {filteredStockCards.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No stock levels" description="Stock level data is not available." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {paginatedStockCards.map((item) => {
                const raw = item as unknown as Record<string, unknown>
                const lastPurchaseDate = raw.lastPurchaseDate as string | undefined
                const lastPurchaseCost = raw.lastPurchaseCost as number | undefined
                const lastPurchaseQty = raw.lastPurchaseQty as number | undefined
                return (
                  <GlassCard key={item.productId} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-on-glass line-clamp-2">{item.productName}</p>
                      <StatusBadge variant={getStockStatusBadge(item.stockStatus)}>{item.stockStatus}</StatusBadge>
                    </div>
                    <p className="text-xs text-on-glass-muted">{item.category}{item.skuCode ? ` · ${item.skuCode}` : ''}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-on-glass-muted">On Hand</p><p className="font-semibold text-on-glass">{item.quantityOnHand}</p></div>
                      <div><p className="text-on-glass-muted">Reorder Pt</p><p className="font-semibold text-on-glass">{item.reorderPoint}</p></div>
                      <div>
                        <p className="text-on-glass-muted">Days Left</p>
                        <p className={`font-semibold ${
                          item.daysUntilStockout <= 3 ? 'text-rust-light' :
                          item.daysUntilStockout <= 7 ? 'text-ochre' : 'text-forest-light'
                        }`}>{item.daysUntilStockout}d</p>
                      </div>
                      <div><p className="text-on-glass-muted">Stock Value</p><p className="font-semibold text-on-glass">{formatRWF(item.stockValue)}</p></div>
                    </div>
                    <ProgressBar value={item.fillPct} className="mt-3" color={item.stockStatus === 'critical' ? '#c2410c' : item.stockStatus === 'low' ? '#c9952a' : '#3d7a5c'} />
                    {/* Purchase history summary */}
                    {item.latestSupplier && (
                      <div className="mt-3 border-t border-white/8 pt-2 text-xs text-on-glass-muted space-y-0.5">
                        <p>Supplier: <span className="font-medium text-forest-light">{item.latestSupplier}</span></p>
                        {lastPurchaseDate && <p>Last buy: <span className="font-medium text-on-glass">{lastPurchaseDate}</span></p>}
                        {lastPurchaseCost && <p>Last cost: <span className="font-medium text-on-glass">{formatRWF(lastPurchaseCost)}</span>{lastPurchaseQty ? ` × ${lastPurchaseQty}` : ''}</p>}
                      </div>
                    )}
                    <button type="button" onClick={() => setHistoryProduct(item)} className="mt-2 text-xs font-medium text-copper-light hover:underline">
                      View purchase history
                    </button>
                  </GlassCard>
                )
              })}
            </div>
            <Pagination
              currentPage={stockPage}
              totalItems={filteredStockCards.length}
              pageSize={stockPageSize}
              onPageChange={setStockPage}
              onPageSizeChange={setStockPageSize}
              pageSizeOptions={[8, 16, 24, 48]}
              className="mt-4"
            />
          </>
        )}
      </div>

      {bestTimeSuggestions.length > 0 && (
        <GlassCard className="border-forest/20 bg-forest/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-forest-light" />
            <div>
              <h3 className="text-lg font-semibold text-on-glass">Best Time to Buy</h3>
              <p className="text-sm text-on-glass-muted">
                {bestTimeSuggestions.length} product{bestTimeSuggestions.length !== 1 ? 's' : ''} with seasonal buying patterns
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedBestTime.map((item, i) => (
              <div key={`${item.productName}-${i}`} className="rounded-xl border border-forest/20 bg-forest/5 p-4">
                <p className="text-sm font-semibold text-on-glass line-clamp-2">{item.productName}</p>
                {item.bestMonth && (
                  <p className="mt-2 text-xs text-on-glass-muted">
                    Best month: <span className="font-medium text-forest-light">{item.bestMonth}</span>
                  </p>
                )}
                {item.avgUnitCost != null && (
                  <p className="text-xs text-on-glass-muted">
                    Avg cost: <span className="font-medium text-on-glass">{formatRWF(item.avgUnitCost)}</span>
                  </p>
                )}
                {item.supplier && (
                  <p className="text-xs text-on-glass-muted">
                    Supplier: <span className="font-medium text-copper-light">{item.supplier}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          <Pagination
            currentPage={bestTimePage}
            totalItems={bestTimeSuggestions.length}
            pageSize={bestTimePageSize}
            onPageChange={setBestTimePage}
            onPageSizeChange={setBestTimePageSize}
            pageSizeOptions={[6, 12, 24]}
            className="mt-4"
          />
        </GlassCard>
      )}

      <GlassCard className="border-rust/20 bg-gradient-to-br from-rust/10 to-ochre/10 p-5">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rust-light" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-on-glass">Stockout Risk Assessment</h3>
                <span className="rounded-full bg-rust/20 px-2 py-0.5 text-xs font-medium text-rust-light">{filteredRisks.length}</span>
              </div>
              <p className="text-sm text-on-glass-muted">Products at risk of running out within {riskDays} days</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
              <input
                type="text"
                placeholder="Search risks..."
                value={riskSearch}
                onChange={(e) => setRiskSearch(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-4 text-sm text-on-glass placeholder:text-on-glass-muted focus:border-rust-light focus:outline-none focus:ring-1 focus:ring-rust-light sm:w-64"
              />
            </div>
            <select
              value={riskLevelFilter}
              onChange={(e) => setRiskLevelFilter(e.target.value as 'all' | 'CRITICAL' | 'HIGH')}
              className="rounded-lg border border-white/10 bg-[#0d1411] px-3 py-2 text-sm text-on-glass focus:border-rust-light focus:outline-none focus:ring-1 focus:ring-rust-light"
            >
              <option value="all">All Levels</option>
              <option value="CRITICAL">Critical Risk</option>
              <option value="HIGH">High Risk</option>
            </select>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRiskDays(d)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    riskDays === d
                      ? 'bg-rust/80 text-white shadow'
                      : 'text-on-glass-muted hover:text-on-glass'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
        {filteredRisks.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title={`No stockout risks within ${riskDays} days`} description="All products have sufficient stock for this period." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {paginatedRisks.map((risk, i) => (
                <div key={`${risk.productName}-${i}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-on-glass">{risk.productName}</p>
                      <p className="text-xs text-on-glass-muted">{risk.category}</p>
                    </div>
                    {getPriorityBadge(risk.level)}
                  </div>
                  <div className="mt-3 flex gap-6 text-sm">
                    <div><p className="text-on-glass-muted">On hand</p><p className="font-semibold text-on-glass">{risk.quantityOnHand}</p></div>
                    <div><p className="text-on-glass-muted">Days left</p><p className={`font-semibold ${risk.daysLeft <= 2 ? 'text-rust-light' : risk.daysLeft <= 7 ? 'text-ochre' : 'text-forest-light'}`}>{risk.daysLeft} days</p></div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              currentPage={riskPage}
              totalItems={filteredRisks.length}
              pageSize={riskPageSize}
              onPageChange={setRiskPage}
              onPageSizeChange={setRiskPageSize}
              pageSizeOptions={[6, 12, 20]}
              className="mt-4"
            />
          </>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-on-glass">Reorder Recommendations</h3>
                <span className="rounded-full bg-copper/20 px-2 py-0.5 text-xs font-medium text-copper-light">{filteredReorders.length}</span>
              </div>
              <p className="text-sm text-on-glass-muted">Suggested purchase orders based on stock levels</p>
            </div>
            {reorders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAutoReorderOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-copper/40 bg-copper/10 px-4 py-2 text-sm font-medium text-copper-light hover:bg-copper/20"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Auto-Create POs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPurchasePrefill(activeReorders.map((r) => ({
                      productId: r.productId,
                      quantity: r.orderQty,
                      unitCost: Number(r.unitPrice),
                    })))
                    setRecordPurchaseOpen(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Create Purchase Orders
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
              <input
                type="text"
                placeholder="Search products or SKU..."
                value={reorderSearch}
                onChange={(e) => setReorderSearch(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-4 text-sm text-on-glass placeholder:text-on-glass-muted focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper sm:w-64"
              />
            </div>
            <select
              value={reorderPriorityFilter}
              onChange={(e) => setReorderPriorityFilter(e.target.value as 'all' | 'URGENT' | 'HIGH' | 'MEDIUM')}
              className="rounded-lg border border-white/10 bg-[#0d1411] px-3 py-2 text-sm text-on-glass focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper"
            >
              <option value="all">All Priorities</option>
              <option value="URGENT">Urgent Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
            </select>
            <select
              value={reorderStatusFilter}
              onChange={(e) => setReorderStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-lg border border-white/10 bg-[#0d1411] px-3 py-2 text-sm text-on-glass focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Removed Only</option>
            </select>
          </div>
        </div>
        {reorders.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="No reorder recommendations" description="All products are adequately stocked." />
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">SKU</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 text-right font-medium">On Hand</th>
                  <th className="pb-3 pr-4 text-right font-medium">Reorder Pt</th>
                  <th className="pb-3 pr-4 text-right font-medium">Order Qty</th>
                  <th className="pb-3 pr-4 text-right font-medium">Unit Cost</th>
                  <th className="pb-3 pr-4 font-medium">Supplier</th>
                  <th className="pb-3 pr-4 font-medium">Priority</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReorders.map((row) => (
                  <tr key={row.productId} className={`border-b border-white/5 transition-colors hover:bg-white/5 ${!row.isActive ? 'opacity-70' : ''}`}>
                    <td className="py-3 pr-4 font-medium text-on-glass">
                      <div>{row.productName}{!row.isActive && <StatusBadge variant="neutral">Inactive</StatusBadge>}</div>
                      {row.supplierInsight && <p className="mt-1 text-xs text-forest-light">{row.supplierInsight}</p>}
                    </td>
                    <td className="py-3 pr-4 text-on-glass-muted">{row.skuCode ?? '—'}</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-on-glass-muted">{row.category}</span></td>
                    <td className="py-3 pr-4 text-right text-on-glass">{row.quantityOnHand}</td>
                    <td className="py-3 pr-4 text-right text-on-glass">{row.reorderPoint}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-copper-light">{row.orderQty}</td>
                    <td className="py-3 pr-4 text-right text-on-glass">{row.unitCost ? formatRWF(row.unitCost) : '—'}</td>
                    <td className="py-3 pr-4">
                      {row.cheapestSupplier ? (
                        <div>
                          <p className="text-xs font-medium text-on-glass">{row.cheapestSupplier}</p>
                          {row.latestSupplier && row.latestSupplier !== row.cheapestSupplier && (
                            <p className="text-xs text-on-glass-muted">Last: {row.latestSupplier}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-on-glass-muted">{row.latestSupplier ?? '—'}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{getPriorityBadge(row.priority)}</td>
                    <td className="py-3">
                      {row.isActive ? (
                        <button type="button" onClick={() => setDeactivateProduct(row)} className="text-xs text-rust-light hover:underline">Remove</button>
                      ) : (
                        <button type="button" onClick={() => { setReorders((prev) => prev.map((x) => x.productId === row.productId ? { ...x, isActive: true } : x)); toast(`${row.productName} reactivated`, 'success') }} className="text-xs text-forest-light hover:underline">Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td colSpan={6} className="pt-3 text-sm font-medium text-on-glass-muted">Estimated total ({activeReorders.length} items)</td>
                  <td className="pt-3 text-right text-lg font-bold text-copper-light">{formatRWF(reorderTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination
            currentPage={reorderPage}
            totalItems={reorders.length}
            pageSize={reorderPageSize}
            onPageChange={setReorderPage}
            onPageSizeChange={setReorderPageSize}
            className="mt-4 px-2"
          />
          </>
        )}
      </GlassCard>

      {pendingPOs.length > 0 && (
        <GlassCard className="mt-8 border-forest/20 bg-forest/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-on-glass">Pending Purchase Orders</h3>
            <span className="rounded-full bg-forest/20 px-3 py-1 text-xs font-medium text-forest-light">{pendingPOs.length} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="pb-3 pr-4 font-medium">Order ID</th>
                  <th className="pb-3 pr-4 font-medium">Date Created</th>
                  <th className="pb-3 pr-4 font-medium">Items</th>
                  <th className="pb-3 pr-4 text-right font-medium">Total Amount</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPendingPOs.map((po) => (
                  <tr key={po.orderId} className="border-b border-white/5 transition-colors hover:bg-white/5">
                    <td className="py-3 pr-4 font-medium text-on-glass">{po.orderId}</td>
                    <td className="py-3 pr-4 text-on-glass-muted">{new Date(po.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 pr-4 text-on-glass-muted">
                      {po.items.length} product{po.items.length === 1 ? '' : 's'}
                      <div className="mt-1 text-xs">{po.items.map(i => i.productName).join(', ')}</div>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-copper-light">{formatRWF(po.totalAmount)}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setPurchasePrefill(po.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitPrice, supplier: i.supplier })))
                          setPurchasePrefillSupplier(po.items[0]?.supplier)
                          setPurchaseOrderId(po.orderId)
                          setRecordPurchaseOpen(true)
                        }}
                        className="rounded-lg bg-forest/20 px-3 py-1.5 text-xs font-medium text-forest-light hover:bg-forest/30"
                      >
                        Receive PO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={pendingPoPage}
            totalItems={pendingPOs.length}
            pageSize={pendingPoPageSize}
            onPageChange={setPendingPoPage}
            onPageSizeChange={setPendingPoPageSize}
            pageSizeOptions={[5, 10, 20]}
            className="mt-4 px-2"
          />
        </GlassCard>
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Inventory Analytics"
        fileName="inventory-analytics"
        resolveExportData={(opts) => fetchInventoryExportData(opts, stockCategoryFilter !== 'all' ? { category: stockCategoryFilter } : {})}
      />
      <PurchaseOrderModal open={poDialogOpen} onClose={() => setPoDialogOpen(false)} initialItems={poItems} />
      <RecordPurchaseModal
        open={recordPurchaseOpen}
        onClose={() => { setRecordPurchaseOpen(false); setPurchasePrefill(undefined); setPurchasePrefillSupplier(undefined); setPurchaseOrderId(undefined) }}
        products={stockCards}
        prefillItems={purchasePrefill}
        prefillSupplier={purchasePrefillSupplier}
        purchaseOrderId={purchaseOrderId}
        onRecorded={load}
      />
      <ProductPurchaseHistoryModal
        open={!!historyProduct}
        onClose={() => setHistoryProduct(null)}
        productId={historyProduct?.productId ?? null}
        productName={historyProduct?.productName ?? ''}
      />

      <ConfirmModal
        isOpen={autoReorderOpen}
        title="Auto-Create Purchase Orders"
        message={`Create a pending Purchase Order for all ${activeReorders.length} reorder recommendations (total ${formatRWF(reorderTotal)})? You will receive it in the Pending POs section when goods arrive.`}
        confirmLabel={autoReordering ? 'Creating PO...' : 'Create PO'}
        onConfirm={() => {
          setAutoReordering(true)
          void inventoryApi.autoCreatePurchaseOrders()
            .then((result) => {
              toast(`Purchase Order ${String(result.orderId ?? '')} created for ${String(result.itemCount ?? 0)} items — total ${formatRWF(Number(result.totalAmount ?? 0))}. Receive it when goods arrive.`, 'success')
              setAutoReorderOpen(false)
              load()
            })
            .catch((err) => toast(getErrorMessage(err), 'error'))
            .finally(() => setAutoReordering(false))
        }}
        onCancel={() => setAutoReorderOpen(false)}
      />

      <DeactivateConfirmModal
        isOpen={!!deactivateProduct}
        itemName={deactivateProduct?.productName ?? 'this product'}
        onConfirm={() => {
          if (deactivateProduct) {
            setReorders((prev) => prev.map((x) => x.productId === deactivateProduct.productId ? { ...x, isActive: false } : x))
            toast(`${deactivateProduct.productName} has been deactivated.`, 'success')
          }
          setDeactivateProduct(null)
        }}
        onCancel={() => setDeactivateProduct(null)}
      />
    </div>
  )
}
