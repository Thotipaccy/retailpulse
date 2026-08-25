import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BrainCircuit, Download, AlertTriangle, CheckCircle2, Loader2, Lightbulb, X, Calendar
} from 'lucide-react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { forecastApi } from '../services/forecastApi'
import { useToast } from '../contexts/ToastContext'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchForecastExportData } from '../services/exportDataService'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { CircularGauge } from '../components/ui/CircularGauge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { getErrorMessage } from '../services/api'
import { CHART_GRID, CHART_TICK, CHART_TOOLTIP } from '../components/ui/chartTheme'
import { Pagination } from '../components/ui/Pagination'
import type {
  DemandForecastResult,
  ForecastAccuracy,
  ForecastStatus,
  ProductForecastRow,
} from '../types/api'

type Horizon = 'daily' | 'weekly' | 'monthly'
type Scope = 'all' | 'category' | 'product'

const HORIZONS: { id: Horizon; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'Short-term tactical planning (Next 7 Days)' },
  { id: 'weekly', label: 'Weekly', hint: 'Operational planning (Next 30 Days)' },
  { id: 'monthly', label: 'Monthly', hint: 'Long-term strategic planning (Next 6 Months)' },
]

const STATUS_VARIANT = {
  urgent: 'danger',
  reorder: 'warning',
  monitor: 'info',
  adequate: 'success',
} as const

const STATUS_LABEL = {
  urgent: 'Urgent!',
  reorder: 'Reorder',
  monitor: 'Monitor',
  adequate: 'Adequate',
} as const

function confidenceBlocks(value: number): string {
  const filled = Math.round(value / 20)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, 5 - filled))
}

function getDataAvailabilityInfo(days: number): {
  label: string
  className: string
  icon: 'check' | 'warning' | 'none'
} {
  if (days === 0) {
    return {
      label: 'No sales history available. Forecasts become available once transactions are recorded.',
      className: 'text-on-glass-muted',
      icon: 'none',
    }
  }
  if (days >= 365) {
    return {
      label: `${days} days of sales history. Multi-season patterns are fully captured — maximum forecast confidence.`,
      className: 'text-forest-light font-bold',
      icon: 'check',
    }
  }
  if (days >= 180) {
    return {
      label: `${days} days of sales history. Trend and quarterly seasonality detection is reliable.`,
      className: 'text-forest-light font-semibold',
      icon: 'check',
    }
  }
  if (days >= 90) {
    return {
      label: `${days} days of sales history. Sufficient for dependable mid-term trend estimates.`,
      className: 'text-forest-light',
      icon: 'check',
    }
  }
  if (days >= 30) {
    return {
      label: `${days} days of sales history. Confidence is moderate — short-term trends only. 90+ days is recommended.`,
      className: 'text-ochre',
      icon: 'warning',
    }
  }
  return {
    label: `${days} days of sales history. Low forecast confidence — accumulate more transaction data.`,
    className: 'text-rust-light',
    icon: 'warning',
  }
}

export function AIPredictivePage() {
  const { toast } = useToast()
  const [initLoading, setInitLoading] = useState(true)
  const [status, setStatus] = useState<ForecastStatus | null>(null)
  const [accuracy, setAccuracy] = useState<ForecastAccuracy | null>(null)
  const [horizon, setHorizon] = useState<Horizon>('daily')
  const [scope, setScope] = useState<Scope>('all')
  const [scopeId, setScopeId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [forecast, setForecast] = useState<DemandForecastResult | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [forecastWarningDismissed, setForecastWarningDismissed] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const loadInitial = useCallback(async () => {
    try {
      const [statusRes, accuracyRes] = await Promise.all([
        forecastApi.getStatus(),
        forecastApi.getAccuracy(),
      ])
      setStatus(statusRes)
      setAccuracy(accuracyRes)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setInitLoading(false)
    }
  }, [toast])

  useEffect(() => {
    const timer = setTimeout(() => { void loadInitial() }, 0)
    return () => clearTimeout(timer)
  }, [loadInitial])

  const historicalDays = status?.historicalDaysAvailable ?? 0
  const dataAvailability = getDataAvailabilityInfo(historicalDays)

  const canGenerate = !generating

  const generateForecast = async () => {
    setGenerating(true)
    setGenerateError(null)
    setForecastWarningDismissed(false)
    setCurrentPage(1)
    try {
      const result = await forecastApi.generateDemandForecast(
        horizon,
        scope,
        scope === 'all' ? undefined : scopeId || undefined,
      )
      setForecast(result)
      if (result.empty && result.message) {
        toast(result.message, 'info')
      } else if (result.warning) {
        toast('Forecast generated with limited data — review warning for details', 'info')
      } else if (result.fallbackUsed) {
        toast('AI service unavailable — using database fallback', 'info')
      } else if (result.lowConfidence) {
        toast('Forecast generated with low model confidence', 'info')
      } else {
        toast('Forecast generated successfully', 'success')
      }
    } catch (err: unknown) {
      setGenerateError(getErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const tableRows = useMemo(() => {
    const rows = forecast?.productForecasts ?? []
    if (!alertsOnly) return rows
    return rows.filter((r) => r.status === 'urgent' || r.status === 'reorder')
  }, [forecast, alertsOnly])


  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return tableRows.slice(start, start + itemsPerPage)
  }, [tableRows, currentPage, itemsPerPage])

  if (initLoading) return <LoadingSkeleton rows={6} />

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={BrainCircuit}
        title="AI Predictive Analytics"
        subtitle="Machine learning-powered demand forecasting and inventory optimization"
        actions={
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-on-glass hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            Export Forecast
          </button>
        }
      />

      {/* Section 2: Forecast Configuration */}
      <GlassCard className="p-6 relative z-[60]">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-on-glass">Generate Demand Forecast</h2>
        <div className="mt-5 space-y-5">
          <div className="pt-2 pb-6">
            <p className="mb-6 text-sm text-on-glass-muted flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Forecast Horizon
            </p>

            {/* Custom Interactive Timeline */}
            <div className="relative max-w-2xl mx-auto px-4 sm:px-12">
              {/* Track Background */}
              <div className="absolute top-3 left-4 right-4 sm:left-12 sm:right-12 h-1 bg-white/10 rounded-full" />

              {/* Active Track Fill */}
              <div
                className="absolute top-3 left-4 sm:left-12 h-1 bg-gradient-to-r from-copper to-copper-light rounded-full transition-all duration-500 ease-out"
                style={{
                  width: horizon === 'daily' ? '0%' : horizon === 'weekly' ? '50%' : '100%'
                }}
              />

              {/* Timeline Stops */}
              <div className="relative flex justify-between">
                {HORIZONS.map((h, index) => {
                  const isActive = horizon === h.id;
                  const isPast = HORIZONS.findIndex(x => x.id === horizon) >= index;

                  return (
                    <div key={h.id} className="flex flex-col items-center group" style={{ width: '120px' }}>
                      <button
                        type="button"
                        onClick={() => setHorizon(h.id)}
                        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 ${isActive
                            ? 'bg-copper shadow-[0_0_15px_rgba(184,115,51,0.6)] scale-125'
                            : isPast
                              ? 'bg-copper-light hover:bg-copper hover:scale-110'
                              : 'bg-glass-panel border-2 border-white/20 hover:border-white/50 hover:scale-110'
                          }`}
                      >
                        {isActive && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                      </button>

                      <div className={`mt-4 text-center transition-colors duration-300 ${isActive ? 'text-copper-light font-semibold' : 'text-on-glass-muted group-hover:text-on-glass'}`}>
                        <div className="text-sm tracking-wide uppercase">{h.label}</div>
                        <div className="text-[10px] opacity-70 mt-1 max-w-[100px] leading-tight mx-auto">{h.hint}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-on-glass-muted">Scope</label>
              <select
                id="forecast-scope-select"
                title="Forecast Scope"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as Scope)
                  setScopeId('')
                }}
                className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Products</option>
                <option value="category">Select Category</option>
                <option value="product">Select Product</option>
              </select>
            </div>
            {scope === 'category' && (
              <div>
                <label className="text-sm text-on-glass-muted">Category</label>
                <select
                  id="forecast-category-select"
                  title="Category Selection"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose category...</option>
                  {status?.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {scope === 'product' && (
              <div>
                <label className="text-sm text-on-glass-muted">Product</label>
                <select
                  id="forecast-product-select"
                  title="Product Selection"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose product...</option>
                  {status?.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {/* Clean UI: Subtle system health indicator that reveals technical details on hover or tap */}
            <div tabIndex={0} className="group relative flex cursor-pointer items-center text-on-glass-muted hover:text-on-glass focus:text-on-glass focus:outline-none z-50">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 hover:border-white/20 group-focus:bg-white/10 group-focus:border-white/20">
                {status?.modelsReady && historicalDays >= 90 ? (
                  <CheckCircle2 className="h-4 w-4 text-forest-light" />
                ) : (
                  <AlertTriangle className={`h-4 w-4 ${historicalDays < 30 ? 'text-rust-light' : 'text-ochre'}`} />
                )}
                <span>Forecast Engine Status</span>
              </div>

              {/* Popover Content */}
              <div className="pointer-events-none absolute left-0 top-full mt-2 w-72 translate-y-2 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus:pointer-events-auto group-focus:translate-y-0 group-focus:opacity-100 z-[100]">
                <div className="rounded-xl border border-white/20 bg-[#1a1917] p-4 text-xs shadow-2xl backdrop-blur-xl">
                  <p className="font-semibold text-on-glass mb-3 border-b border-white/10 pb-2">Engine Diagnostics</p>

                  <div className="space-y-4">
                    <div>
                      <p className="text-on-glass-muted mb-1.5 flex items-center gap-1.5 font-medium">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        AI Model Status
                      </p>
                      <div className="rounded-lg bg-white/5 p-2.5">
                        <ul className="space-y-2 text-on-glass-muted">
                          <li className="flex justify-between items-center">
                            <span>Status:</span>
                            <span className="text-on-glass font-medium">{status?.modelsReady ? 'Trained & Ready' : 'Not Ready'}</span>
                          </li>
                          {status?.lastTrained && (
                            <li className="flex justify-between items-center">
                              <span>Last Calibrated:</span>
                              <span className="text-on-glass font-medium">{status.lastTrained}</span>
                            </li>
                          )}
                          {status?.mape != null && (
                            <li className="flex justify-between items-center">
                              <span title="Mean Absolute Percentage Error converted to accuracy">Accuracy Score:</span>
                              <span className="text-forest-light font-bold">{Math.round(100 - status.mape)}%</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <p className="text-on-glass-muted mb-1.5 flex items-center gap-1.5 font-medium">
                        <Lightbulb className="h-3.5 w-3.5" />
                        Sales History
                      </p>
                      <div className="rounded-lg bg-white/5 p-2.5">
                        <p className={`leading-relaxed ${dataAvailability.className}`}>
                          {dataAvailability.label}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!status?.aiServiceHealthy && historicalDays > 0 && (
            <div className="rounded-lg border border-steel/30 bg-steel/10 px-4 py-3 text-sm text-steel-light">
              The forecasting service is currently unreachable. New forecasts cannot be generated until the connection is restored — previously generated results remain available.
            </div>
          )}
          {generateError && (
            <ErrorState message={generateError} onRetry={() => void generateForecast()} />
          )}

          <button
            type="button"
            onClick={() => void generateForecast()}
            disabled={!canGenerate || (scope !== 'all' && !scopeId)}
            className="inline-flex items-center gap-2 rounded-lg bg-copper px-6 py-2.5 text-sm font-semibold text-white hover:bg-copper-light disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {generating ? 'Generating...' : 'Generate Forecast'}
          </button>
        </div>
      </GlassCard>

      {/* Section 3: Model Accuracy Gauges */}
      {accuracy && (
        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-on-glass">Model Performance</h2>
          <p className="mt-1 text-sm text-on-glass-muted">
            {accuracy.aiPowered ? 'AI service connected' : 'Database forecast models'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-10">
            <CircularGauge value={Math.round(accuracy.overall)} label="Overall Model Accuracy" color="#B87333" />
            <CircularGauge value={Math.round(accuracy.weeklyPrecision)} label="7-Day Forecast Precision" color="#3D7A5C" />
            <CircularGauge value={Math.round(accuracy.seasonalDetection)} label="Seasonal Pattern Detection" color="#C4922A" />
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-on-glass">
              {horizon === 'weekly' ? '4-Week Demand Forecast' : horizon === 'monthly' ? '3-Month Demand Forecast' : '7-Day Demand Forecast'}
            </h2>
            <p className="text-sm text-on-glass-muted">
              {horizon === 'weekly' ? 'Predicted weekly sales with confidence intervals' : horizon === 'monthly' ? 'Predicted monthly sales with confidence intervals' : 'Predicted daily sales with confidence intervals'}
            </p>
          </div>
          {forecast && (
            <StatusBadge variant={forecast.lowConfidence ? 'warning' : 'success'}>
              MAPE Score: {forecast.mape}%
            </StatusBadge>
          )}
        </div>

        {generating ? (
          <LoadingSkeleton rows={4} />
        ) : generateError ? (
          <ErrorState message={generateError} onRetry={generateForecast} />
        ) : !forecast ? (
          <EmptyState
            icon={<BrainCircuit className="h-6 w-6" />}
            title="No forecast generated yet"
            description="Select parameters and click Generate Forecast."
          />
        ) : forecast.empty ? (
          <EmptyState
            icon={<BrainCircuit className="h-6 w-6" />}
            title="No historical data"
            description={forecast.message ?? 'No historical data available. Upload data first.'}
          />
        ) : (
          <>
            {forecast.warning && !forecastWarningDismissed && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-ochre/30 bg-ochre/10 px-4 py-3 text-sm text-ochre">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p>{forecast.warning}</p>
                  {forecast.lowConfidence && (
                    <p className="mt-1 text-xs text-on-glass-muted">
                      Confidence intervals may be wider with limited historical data.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setForecastWarningDismissed(true)}
                  className="shrink-0 rounded p-1 hover:bg-ochre/20"
                  aria-label="Dismiss warning"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div data-export-chart data-export-chart-title="7-Day Demand Forecast">
              {!forecast.chart.some((p) => p.actual != null) && (
                <p className="mb-3 text-xs text-on-glass-muted">
                  Historical sales are not available yet — the chart shows forecasted demand only.
                </p>
              )}
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={forecast.chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="date" tick={CHART_TICK} tickFormatter={(v) => horizon === 'daily' && String(v).includes('-') ? String(v).slice(5) : String(v)} />
                  <YAxis tick={CHART_TICK} label={{ value: 'Units', angle: -90, position: 'insideLeft', fill: CHART_TICK.fill }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="rgba(184,115,51,0.18)" name="Confidence Upper" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="#2c2a28" name="Confidence Lower" />
                  <Line type="monotone" dataKey="actual" stroke="#3D7A5C" strokeWidth={2.5} dot={{ fill: '#3D7A5C', r: 4 }} name="Actual Sales" connectNulls={false} />
                  <Line type="monotone" dataKey="predicted" stroke="#B87333" strokeWidth={2} strokeDasharray="6 4" dot={{ fill: '#B87333', r: 3 }} name="Predicted Sales" connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-on-glass-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-forest-light" />Actual Sales</span>
              <span className="flex items-center gap-1.5"><span className="h-4 w-5 border-t-2 border-dashed border-copper" />Predicted</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-copper/20" />Confidence Interval</span>
            </div>
            {forecast.fallbackUsed && (
              <p className="mt-3 text-xs text-steel-light">Using database fallback — AI service was unavailable.</p>
            )}
          </>
        )}
      </GlassCard>

      {/* Section 6: Product-Level Forecast Table */}
      <GlassCard className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-on-glass">Product-Level Demand Forecast</h2>
            <p className="text-sm text-on-glass-muted">
              {horizon === 'weekly' ? 'Detailed predictions per product for the next 4 weeks' : horizon === 'monthly' ? 'Detailed predictions per product for the next 3 months' : 'Detailed predictions per product for the next 7 days'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setAlertsOnly((v) => !v); setCurrentPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${alertsOnly ? 'bg-copper/20 text-copper-light' : 'border border-white/15 text-on-glass-muted'
                }`}
            >
              View Alerts Only
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-on-glass-muted hover:text-on-glass"
            >
              Export
            </button>
          </div>
        </div>
        {!forecast ? (
          <EmptyState
            icon={<BrainCircuit className="h-6 w-6" />}
            title="No product forecasts"
            description="Generate a forecast to see product-level predictions."
          />
        ) : tableRows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="No alert products"
            description="All products are adequately stocked."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-on-glass-muted">
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">Current Stock</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Total Predicted Demand ({HORIZONS.find(h => h.id === horizon)?.label || 'Period'})
                    </th>
                    <th className="px-4 py-3 font-medium text-right">Reorder</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row: ProductForecastRow) => (
                    <tr key={row.productId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-6 py-3.5 font-medium text-on-glass">{row.productName}</td>
                      <td className="px-4 py-3.5 text-on-glass-muted">{row.category}</td>
                      <td className="px-4 py-3.5 text-right text-on-glass">{row.currentStock}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-copper-light">
                        {row.predictedDemand}
                      </td>
                      <td className="px-4 py-3.5 text-right text-on-glass-muted">
                        {row.reorderDelta != null ? `+${row.reorderDelta}` : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={row.confidence} color="#B87333" thin className="w-16" />
                          <span className="font-mono text-xs text-on-glass-muted">
                            {row.confidence}% {confidenceBlocks(row.confidence)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge variant={STATUS_VARIANT[row.status]}>
                          {STATUS_LABEL[row.status]}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={tableRows.length}
              pageSize={itemsPerPage}
              onPageChange={setCurrentPage}
              onPageSizeChange={setItemsPerPage}
              className="mt-4 px-6 pb-4"
            />
          </>
        )}
      </GlassCard>

      {/* Section 7: AI-Generated Insights */}
      {forecast?.insights && (
        <GlassCard className="border-copper/20 bg-copper/5 p-6">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-copper/20">
              <Lightbulb className="h-5 w-5 text-copper-light" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-on-glass">AI-Generated Insights</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-on-glass-muted">
                {forecast.insights}
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Forecast"
        resolveExportData={fetchForecastExportData}
      />
    </div>
  )
}
