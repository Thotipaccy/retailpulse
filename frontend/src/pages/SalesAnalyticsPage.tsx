import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Download, Hammer, Package, Paintbrush, Target, TrendingDown, TrendingUp, Wrench, Zap,
} from 'lucide-react'
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { salesApi } from '../services/salesApi'
import { ROUTES } from '../config/routes'
import { formatRWF } from '../utils/format'
import { getErrorMessage } from '../services/api'
import { GlassCard } from '../components/ui/GlassCard'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchSalesExportData } from '../services/exportDataService'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { SetSalesGoalModal } from '../components/modals/SetSalesGoalModal'
import { clearSalesGoal, loadSalesGoals, saveSalesGoal, type SalesPeriod } from '../utils/salesGoals'
import type { ChartPoint, HeatmapPoint, SalesOverview } from '../types/api'

type Period = 'today' | 'daily' | 'weekly' | 'monthly' | 'yearly'

interface ChartRow {
  name: string
  actual: number
  target?: number
}

interface TopProductRow {
  rank: number
  name: string
  category: string
  units: number
  revenue: number
  margin: string
  trend: number
}

const RANK_COLORS = ['bg-copper', 'bg-steel', 'bg-bronze', 'bg-forest', 'bg-ochre', 'bg-charcoal-500']
const CATEGORY_COLORS = ['#B87333', '#5A7289', '#3D7A5C', '#C9952A', '#A67C52', '#6B705C']

const tooltipStyle = { background: 'rgba(44,42,40,0.92)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#F5F3F0' }

function formatRWFAxis(value: number): string {
  if (value >= 1_000_000) return `RWF ${(value / 1_000_000).toFixed(0)}M`
  return `RWF ${(value / 1_000).toFixed(0)}K`
}

function buildChartData(trend: ChartPoint[] | undefined): ChartRow[] {
  if (!trend?.length) return []
  return trend.map((p) => ({ name: p.name, actual: Number(p.value) }))
}

function mapTopProducts(rows: Record<string, unknown>[]): TopProductRow[] {
  return rows.map((row, i) => ({
    rank: i + 1,
    name: String(row.productName ?? row.name ?? 'Unknown'),
    category: String(row.category ?? '—'),
    units: Number(row.unitsSold ?? row.units ?? row.quantity ?? 0),
    revenue: Number(row.revenue ?? row.totalRevenue ?? 0),
    margin: row.margin != null ? `${Number(row.margin)}%` : '—',
    trend: Number(row.growth ?? row.trend ?? 0),
  }))
}

export function SalesAnalyticsPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period | 'custom'>('daily')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [exportOpen, setExportOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goals, setGoals] = useState(loadSalesGoals)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartData, setChartData] = useState<ChartRow[]>([])
  const [overview, setOverview] = useState<SalesOverview | null>(null)
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])
  const [byCategory, setByCategory] = useState<ChartPoint[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([])

  const periodGoal = goals[period as SalesPeriod]
  const totalActual = chartData.reduce((s, d) => s + d.actual, 0)
  const displayRevenue = overview?.periodRevenue ? Number(overview.periodRevenue) : totalActual

  const chartWithGoal = useMemo(() => {
    if (!periodGoal) return chartData
    return chartData.map((d) => ({ ...d, target: periodGoal }))
  }, [chartData, periodGoal])

  const categoryDonut = useMemo(() => {
    const total = byCategory.reduce((sum, p) => sum + Number(p.value), 0) || 1
    return byCategory.map((p, i) => ({
      name: p.name,
      value: Math.round((Number(p.value) / total) * 100),
      color: String(p.fill ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
    }))
  }, [byCategory])

  const maxHeat = useMemo(() => Math.max(...heatmap.map(p => Number(p.value)), 1), [heatmap])
  const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const HEATMAP_HOURS = ["8am-10am", "10am-12pm", "12pm-2pm", "2pm-4pm", "4pm-6pm", "6pm+"]

  const handleResetGoal = () => {
    clearSalesGoal(period as SalesPeriod)
    setGoals(loadSalesGoals())
  }

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const sd = period === 'custom' && startDate ? startDate : undefined
    const ed = period === 'custom' && endDate ? endDate : undefined

    Promise.allSettled([
      salesApi.getOverview(period, sd, ed),
      salesApi.getTopProducts(6, period, sd, ed),
      salesApi.getByCategory(period, sd, ed),
      salesApi.getHeatmap(period, sd, ed),
    ]).then(([overviewRes, topRes, categoryRes, heatmapRes]) => {
      if (cancelled) return

      const failed = [overviewRes, topRes, categoryRes, heatmapRes].filter((r) => r.status === 'rejected')
      if (failed.length === 4) {
        setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
        return
      }

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value)
        setChartData(buildChartData(overviewRes.value.trend))
      } else {
        setOverview(null)
        setChartData([])
      }

      if (topRes.status === 'fulfilled') {
        setTopProducts(mapTopProducts(topRes.value))
      } else {
        setTopProducts([])
      }

      if (categoryRes.status === 'fulfilled') {
        setByCategory(categoryRes.value)
      } else {
        setByCategory([])
      }

      if (heatmapRes.status === 'fulfilled') {
        setHeatmap(heatmapRes.value)
      } else {
        setHeatmap([])
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [period, startDate, endDate])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      load()
    })()
    return () => { cancelled = true; void cancelled }
  }, [load])

  if (loading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav className="mb-2 flex items-center gap-1 text-sm text-on-glass-muted">
            <Link to={ROUTES.DASHBOARD} className="hover:text-on-glass">Home</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-on-glass">Sales Analytics</span>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/20">
              <TrendingUp className="h-5 w-5 text-copper-light" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-on-glass">Sales Analytics</h1>
              <p className="text-sm text-on-glass-muted">Comprehensive sales performance analysis</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <GlassCard className="border-copper/20 bg-copper/10 p-5">
          <p className="text-sm text-on-glass-muted">Period Revenue</p>
          <p className="mt-2 text-2xl font-bold text-on-glass">{formatRWF(displayRevenue)}</p>
          {overview?.growthRate != null && (
            <p className={`mt-1 text-sm font-medium ${Number(overview.growthRate) >= 0 ? 'text-forest-light' : 'text-rust-light'}`}>
              {Number(overview.growthRate) >= 0 ? '↑' : '↓'} {Math.abs(Number(overview.growthRate)).toFixed(1)}%
              <span className="text-on-glass-subtle font-normal ml-1">
                vs previous {period === 'daily' ? 'day' : period === 'weekly' ? '7 days' : period === 'monthly' ? 'month' : period === 'yearly' ? 'year' : 'period'}
              </span>
            </p>
          )}
        </GlassCard>
        <GlassCard className="border-forest/20 bg-forest/10 p-5">
          <p className="text-sm text-on-glass-muted">Growth Rate</p>
          <p className={`mt-2 text-2xl font-bold ${Number(overview?.growthRate) >= 0 ? 'text-forest-light' : 'text-rust-light'}`}>
            {overview?.growthRate != null ? `${Number(overview.growthRate) >= 0 ? '+' : ''}${Number(overview.growthRate).toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1 text-sm text-on-glass-muted">
            Compared to previous {period === 'daily' ? 'day' : period === 'weekly' ? '7 days' : period === 'monthly' ? 'month' : period === 'yearly' ? 'year' : 'period'}
          </p>
        </GlassCard>
        <GlassCard className="border-ochre/20 bg-ochre/10 p-5">
          <p className="text-sm text-on-glass-muted">Total Units Sold</p>
          <p className="mt-2 text-2xl font-bold text-on-glass">
            {overview?.totalUnits != null ? Number(overview.totalUnits).toLocaleString() : '—'}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-on-glass">Sales Performance</h3>
            <p className="text-sm text-on-glass-muted">Actual sales for the selected period</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              title="Period Selection"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period | 'custom')}
              className="rounded-lg border border-white/10 bg-charcoal-900 px-3 py-1.5 text-sm text-on-glass focus:border-copper focus:outline-none"
            >
              <option value="today">Today (Hourly)</option>
              <option value="daily">Last 7 Days (Daily)</option>
              <option value="weekly">Last 4 Weeks (Weekly)</option>
              <option value="monthly">Last 8 Months (Monthly)</option>
              <option value="yearly">Last Year (Quarterly)</option>
              <option value="custom">Custom Date Range</option>
            </select>
            
            {period === 'custom' && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                <input
                  type="date"
                  title="Start Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-xs text-on-glass focus:outline-none [color-scheme:dark]"
                />
                <span className="text-on-glass-muted text-xs">to</span>
                <input
                  type="date"
                  title="End Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-xs text-on-glass focus:outline-none [color-scheme:dark]"
                />
              </div>
            )}
            
            <button type="button" onClick={() => setGoalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-on-glass hover:border-copper/40">
              <Target className="h-3.5 w-3.5" />
              Set Goal
            </button>
            {periodGoal && (
              <button type="button" onClick={handleResetGoal} className="px-2 py-1.5 text-xs text-rust-light hover:underline">Reset Goal</button>
            )}
          </div>
        </div>
        {chartWithGoal.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No sales trend data" description="Sales trend data is not available for this period." />
        ) : (
          <div data-export-chart data-export-chart-title="Sales Performance">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartWithGoal}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4914A" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#B87333" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'rgba(245,243,240,0.7)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'rgba(245,243,240,0.7)' }} tickFormatter={formatRWFAxis} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatRWF(Number(v)), '']} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
              <Bar dataKey="actual" name="Actual Sales" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
              {periodGoal != null && (
                <Line type="monotone" dataKey="target" name="Target" stroke="#B87333" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#B87333', r: 3 }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-on-glass">Top Selling Products</h3>
            <p className="text-sm text-on-glass-muted">Best performers this period</p>
          </div>
          <button type="button" onClick={() => navigate(ROUTES.PRODUCTS)} className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-on-glass hover:border-copper/40 hover:bg-copper/10">View All Products</button>
        </div>
        {topProducts.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No product sales data" description="Top product rankings are not available yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="pb-3 pr-4 font-medium">Rank</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 text-right font-medium">Units Sold</th>
                  <th className="pb-3 pr-4 text-right font-medium">Revenue</th>
                  <th className="pb-3 pr-4 text-right font-medium">Profit Margin</th>
                  <th className="pb-3 text-center font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={row.rank} className="border-b border-white/5 transition-colors hover:bg-white/5">
                    <td className="py-3 pr-4">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white ${RANK_COLORS[row.rank - 1] ?? RANK_COLORS[0]}`}>{row.rank}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                          {row.category === 'Tools' ? <Wrench className="h-4 w-4 text-copper-light" /> :
                           row.category === 'Paint' ? <Paintbrush className="h-4 w-4 text-copper-light" /> :
                           row.category === 'Hardware' ? <Hammer className="h-4 w-4 text-copper-light" /> :
                           <Zap className="h-4 w-4 text-copper-light" />}
                        </span>
                        <span className="font-medium text-on-glass">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-on-glass-muted">{row.category}</span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-on-glass">{row.units.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-right font-medium text-on-glass">{formatRWF(row.revenue)}</td>
                    <td className="py-3 pr-4 text-right font-medium text-on-glass">{row.margin}</td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${row.trend >= 0 ? 'bg-forest/20 text-forest-light' : 'bg-rust/20 text-rust-light'}`}>
                        {row.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(row.trend).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Sales by Category</h3>
          <p className="mb-4 text-sm text-on-glass-muted">Revenue distribution across categories</p>
          {categoryDonut.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No category data" description="Category breakdown is not available." />
          ) : (
            <div data-export-chart data-export-chart-title="Sales by Category">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                <Pie data={categoryDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {categoryDonut.map((s, i) => (
                    <Cell key={`${s.name}-${i}`} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Share']} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Sales Heatmap</h3>
          {heatmap.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No heatmap data" description="Sales heatmap data is not available." />
          ) : (
            <div data-export-chart data-export-chart-title="Sales Heatmap" className="mt-6 flex flex-col gap-1.5 h-[280px] justify-center">
              {/* X-axis labels (Hours) */}
              <div className="flex items-center gap-1.5 mb-1 pr-2">
                <span className="w-10"></span>
                <div className="flex flex-1 gap-1.5">
                  {HEATMAP_HOURS.map(hour => (
                    <span key={hour} className="flex-1 text-center text-[10px] text-on-glass-muted leading-tight">
                      {hour.replace('-', ' - ')}
                    </span>
                  ))}
                </div>
              </div>
              {/* Y-axis rows (Days) */}
              {HEATMAP_DAYS.map(day => (
                <div key={day} className="flex items-center gap-1.5 pr-2">
                  <span className="w-10 text-xs font-medium text-on-glass-muted text-right">{day}</span>
                  <div className="flex flex-1 gap-1.5 h-7">
                    {HEATMAP_HOURS.map(hour => {
                      const point = heatmap.find(p => p.day === day && p.hour === hour)
                      const val = Number(point?.value || 0)
                      const intensity = val === 0 ? 0 : Math.max(0.1, val / maxHeat)
                      
                      const opacityClass = intensity === 0 ? 'bg-white/5' :
                        intensity > 0.8 ? 'bg-copper' :
                        intensity > 0.6 ? 'bg-copper/80' :
                        intensity > 0.4 ? 'bg-copper/60' :
                        intensity > 0.2 ? 'bg-copper/40' : 'bg-copper/20'

                      return (
                        <div 
                          key={`${day}-${hour}`}
                          className={`group relative flex-1 rounded-sm cursor-help transition-all duration-300 hover:ring-2 hover:ring-copper ${opacityClass}`}
                        >
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded-lg border border-white/20 bg-[#1a1917] px-3 py-2 text-xs text-on-glass shadow-xl backdrop-blur-xl">
                              <p className="font-semibold">{day}, {hour}</p>
                              <p className="text-copper-light mt-0.5">{formatRWF(val)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Sales Analytics"
        fileName="sales-analytics"
        resolveExportData={fetchSalesExportData}
      />
      <SetSalesGoalModal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        currentGoal={periodGoal}
        onSave={(amount) => { saveSalesGoal(period as SalesPeriod, amount); setGoals(loadSalesGoals()) }}
        onReset={handleResetGoal}
      />
    </div>
  )
}
