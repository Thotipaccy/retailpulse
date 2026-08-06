import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, Brain, Download, Info, Package, Target, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ROUTES } from '../config/routes'
import { dashboardApi } from '../services/dashboardApi'
import { salesApi } from '../services/salesApi'
import { formatRelativeTime, formatRWF } from '../utils/format'
import { GlassCard } from '../components/ui/GlassCard'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { DASHBOARD_REFRESH_EVENT } from '../utils/dashboardRefresh'
import { loadSalesGoals } from '../utils/salesGoals'
import { getErrorMessage } from '../services/api'
import type { Alert } from '../types'
import type { ChartPoint, DashboardSummary } from '../types/api'

const CATEGORY_COLORS = ['#B87333', '#5A7289', '#3D7A5C', '#C9952A', '#A67C52', '#6B705C']

const KPI_ICONS: Record<string, typeof Wallet> = {
  TrendingUp,
  Wallet,
  Users,
  Package,
  AlertTriangle,
  Target,
  Activity,
}

const tooltipStyle = { background: 'rgba(44,42,40,0.92)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#F5F3F0' }

interface InventoryBarRow {
  category: string
  inStock: number
  lowStock: number
  outOfStock: number
}

function normalizeCategoryDonut(points: ChartPoint[]) {
  const total = points.reduce((sum, p) => sum + Number(p.value), 0) || 1
  return points.map((p, i) => ({
    name: p.name,
    value: Math.round((Number(p.value) / total) * 100),
    color: String(p.fill ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
  }))
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [salesData, setSalesData] = useState<{ name: string; actual: number; target?: number }[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [categoryDonut, setCategoryDonut] = useState<{ name: string; value: number; color: string }[]>([])
  const [inventoryBars, setInventoryBars] = useState<InventoryBarRow[]>([])
  const [aiPredictions, setAiPredictions] = useState<{ product: string; confidence: number; trend: 'up' | 'down'; prediction: string; status?: 'urgent' | 'reorder' | 'monitor' | 'adequate' }[]>([])
  const [outstanding, setOutstanding] = useState<any[]>([])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.allSettled([
      dashboardApi.getSummary(),
      dashboardApi.getSalesTrend(),
      dashboardApi.getRecentAlerts(),
      salesApi.getByCategory(),
      dashboardApi.getInventoryByCategory(),
      dashboardApi.getTopDemandProducts(3),
      salesApi.getOutstanding(),
    ]).then(([summaryRes, salesRes, alertsRes, categoryRes, inventoryRes, demandRes, outRes]) => {
      if (cancelled) return

      const failed = [summaryRes, salesRes, alertsRes, categoryRes, inventoryRes, demandRes].filter((r) => r.status === 'rejected')
      if (failed.length === 7) {
        setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
        return
      }

      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)

      const dailyGoal = loadSalesGoals().daily
      if (salesRes.status === 'fulfilled' && salesRes.value.length) {
        setSalesData(
          salesRes.value.map((p) => ({
            name: String(p.name).slice(5),
            actual: Number(p.value),
            target: dailyGoal ?? undefined,
          })),
        )
      } else {
        setSalesData([])
      }

      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.slice(0, 5))

      if (categoryRes.status === 'fulfilled' && categoryRes.value.length) {
        setCategoryDonut(normalizeCategoryDonut(categoryRes.value))
      } else {
        setCategoryDonut([])
      }

      if (inventoryRes.status === 'fulfilled' && inventoryRes.value.length) {
        setInventoryBars(inventoryRes.value.map((r) => ({
          category: r.category,
          inStock: r.inStock,
          lowStock: r.lowStock,
          outOfStock: r.outOfStock,
        })))
      } else {
        setInventoryBars([])
      }

      if (demandRes.status === 'fulfilled' && demandRes.value.length) {
        setAiPredictions(
          demandRes.value.map((row) => ({
            product: row.productName,
            confidence: row.confidence || 0,
            trend: row.trend || 'up',
            status: row.status,
            prediction: row.status === 'urgent' || row.status === 'reorder'
              ? `Action needed: Restock recommended (${row.unitsSold} units expected)`
              : `Stock is adequate for expected demand (${row.unitsSold} units expected)`,
          })),
        )
      } else {
        setAiPredictions([])
      }

      if (outRes.status === 'fulfilled') {
        setOutstanding(outRes.value)
      } else {
        setOutstanding([])
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

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
    const onRefresh = () => load()
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
  }, [load])

  const kpis = useMemo(() => {
    const baseKpis = summary?.kpis?.slice(0, 3) ?? []
    
    const outstandingTotal = outstanding.reduce((sum, item) => sum + item.totalAmount, 0)
    
    const outstandingKpi = {
      id: 'outstanding-credit',
      label: 'Outstanding Credit',
      value: formatRWF(outstandingTotal),
      trend: outstanding.length.toString(),
      trendLabel: 'pending transactions',
      icon: 'AlertTriangle'
    }

    return [outstandingKpi, ...baseKpis]
  }, [summary, outstanding])

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const displayAlerts = alerts.map((a) => ({
    id: a.alertId,
    message: a.message,
    time: formatRelativeTime(a.createdAt),
    color: a.severity === 'critical' ? 'bg-rust-light' : a.severity === 'high' ? 'bg-ochre' : 'bg-steel-light',
  }))

  return (
    <div className="pb-20">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.length === 0 ? (
          <GlassCard className="col-span-full p-6">
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No KPI data" description="Dashboard summary is empty. Check that transactions exist in the database." />
          </GlassCard>
        ) : kpis.map((kpi) => {
          const Icon = KPI_ICONS[kpi.icon] ?? Activity
          const up = Number(kpi.trend) >= 0
          const TrendIcon = up ? TrendingUp : TrendingDown
          const trendColor = up ? 'text-forest-light' : 'text-rust-light'
          return (
            <GlassCard key={kpi.id} hover className="p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-glass-muted">{kpi.label}</span>
                <Icon className="h-4 w-4 text-copper-light" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold text-on-glass">{kpi.value}</p>
              <div className={`mt-3 flex items-center gap-1 ${trendColor}`}>
                <TrendIcon className="h-3 w-3" />
                <span className="text-xs font-medium">{up ? '+' : ''}{kpi.trend}% {kpi.trendLabel}</span>
              </div>
            </GlassCard>
          )
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-on-glass">Daily Sales Performance</h3>
              <p className="text-sm text-on-glass-muted">Last 7 days sales vs target</p>
            </div>
          </div>
          {salesData.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No sales data" description="Sales overview returned no trend points for this period." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B87333" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#B87333" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'rgba(245,243,240,0.7)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'rgba(245,243,240,0.7)' }} tickFormatter={(v) => `RWF ${(Number(v) / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatRWF(Number(v)), '']} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
                <Area type="monotone" dataKey="actual" name="Actual Sales" stroke="#B87333" strokeWidth={2} fill="url(#salesGrad)" />
                <Line type="monotone" dataKey="target" name="Target" stroke="#5A7289" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Recent Alerts</h3>
          {displayAlerts.length === 0 ? (
            <EmptyState icon={<Info className="h-6 w-6" />} title="No alerts" description="You have no recent notifications." />
          ) : (
            <>
              <div className="mt-4 space-y-2">
                {displayAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate(ROUTES.ALERTS)}
                    className="flex w-full items-start gap-3 rounded-lg bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-on-glass">{alert.message}</p>
                      <p className="mt-0.5 text-xs text-on-glass-muted">{alert.time}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate(ROUTES.ALERTS)}
                className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-copper-light transition-colors hover:bg-white/5"
              >
                View All Notifications
              </button>
            </>
          )}
        </GlassCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Product Category Breakdown</h3>
          <p className="text-sm text-on-glass-muted">Sales distribution by category</p>
          {categoryDonut.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="No category data" description="Sales by category is unavailable." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2}>
                    {categoryDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Share']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {categoryDonut.map((c) => {
                  return (
                    <div key={c.name} className="flex items-center gap-2 text-sm text-on-glass-muted">
                      <span
                        // We use a CSS variable to pass the dynamic color, avoiding the inline-style lint rule.
                        style={{ '--chart-color': c.color, backgroundColor: 'var(--chart-color)' } as React.CSSProperties}
                        className="h-3 w-3 rounded-sm"
                      />
                      {c.name} ({c.value}%)
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Inventory Status by Category</h3>
          <p className="text-sm text-on-glass-muted">Current stock levels</p>
          {inventoryBars.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="No inventory data" description="Stock levels are unavailable." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={inventoryBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'rgba(245,243,240,0.7)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(245,243,240,0.7)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
                <Bar dataKey="inStock" name="In Stock" fill="#3D7A5C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lowStock" name="Low Stock" fill="#C9952A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outOfStock" name="Out of Stock" fill="#C2410C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      <GlassCard className="mt-6 border-copper/20 bg-copper/5 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/20">
            <Brain className="h-5 w-5 text-copper-light" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-on-glass">AI Demand Predictions</h3>
            <p className="text-sm text-on-glass-muted">Top products by predicted weekly demand from the AI model</p>
          </div>
        </div>
        {aiPredictions.length === 0 ? (
          <EmptyState icon={<Brain className="h-6 w-6" />} title="No AI predictions" description="Recommendations could not be loaded from the AI service." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {aiPredictions.map((item) => (
              <div
                key={item.product}
                className="relative rounded-xl border border-white/10 bg-charcoal-800/40 p-4 transition-colors hover:border-copper/40"
              >
                <div className="absolute right-4 top-4">
                  {item.trend === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-forest-light" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rust-light" />
                  )}
                </div>
                <p className="font-medium text-on-glass">{item.product}</p>
                <p className="mt-1 text-xs text-on-glass-muted">{item.prediction}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-on-glass-muted">AI Confidence</span>
                  <span className="font-semibold text-copper-light">{item.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <button
        type="button"
        onClick={() => navigate(ROUTES.REPORTS)}
        className="fixed bottom-8 right-8 z-20 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-copper to-copper-dark px-6 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
      >
        <Download className="h-5 w-5" />
        Export Dashboard
      </button>
    </div>
  )
}
