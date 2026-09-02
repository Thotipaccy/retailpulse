import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Download, Users } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { customerApi } from '../services/customerApi'
import { formatRWF } from '../utils/format'
import { CHART_GRID, CHART_TICK, CHART_TOOLTIP } from '../components/ui/chartTheme'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchCustomerExportData } from '../services/exportDataService'
import { GlassCard } from '../components/ui/GlassCard'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { getErrorMessage } from '../services/api'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatusBadge, getChurnRiskBadge } from '../components/ui/StatusBadge'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { Pagination } from '../components/ui/Pagination'
import { ROUTES } from '../config/routes'
import { useToast } from '../contexts/ToastContext'
import type { CustomerSummary } from '../types/api'
import type { Customer } from '../types'

const SEGMENT_COLORS: Record<string, string> = {
  VIP: '#B87333',
  Regular: '#5A7289',
  Occasional: '#c9952a',
  New: '#3d7a5c',
  Champions: '#B87333',
  Loyal: '#5A7289',
  'At Risk': '#c9952a',
  Dormant: '#6b645c',
  Lost: '#c2410c',
}

const FOREST = '#3d7a5c'

type TopCustomer = Customer & { tier: 'VIP' | 'Regular'; isActive: boolean }

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function mapSegmentName(name: string): string {
  const map: Record<string, string> = {
    Champions: 'VIP',
    Loyal: 'Regular',
    'At Risk': 'At Risk',
    Dormant: 'Dormant',
    Lost: 'New',
  }
  return map[name] ?? name
}

function aggregateSegments(raw: { name: string; value: number; fill: string }[]) {
  const merged = new Map<string, { name: string; value: number; fill: string }>()
  for (const seg of raw) {
    const existing = merged.get(seg.name)
    if (existing) existing.value += seg.value
    else merged.set(seg.name, { ...seg })
  }
  return Array.from(merged.values())
}

function toTopCustomer(c: Customer): TopCustomer {
  return {
    ...c,
    tier: c.rfmSegment === 'Champions' || Number(c.lifetimeValue) > 300_000 ? 'VIP' : 'Regular',
    isActive: true,
  }
}

export function CustomerAnalyticsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [summary, setSummary] = useState<CustomerSummary | null>(null)
  const [segments, setSegments] = useState<{ name: string; value: number; fill: string }[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [deactivateTarget, setDeactivateTarget] = useState<TopCustomer | null>(null)
  const [frequencyData, setFrequencyData] = useState<Array<{ name: string; count: number }>>([])
  const [ltvTrend, setLtvTrend] = useState<Array<{ name: string; ltv: number }>>([])
  const [customerPage, setCustomerPage] = useState(1)
  const [customerPageSize, setCustomerPageSize] = useState(10)

  const load = useCallback(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setError(null)
        setLoading(true)
      }
    })
    Promise.allSettled([
      customerApi.getSummary(),
      customerApi.getSegments(),
      customerApi.getTop(10),
      customerApi.getFrequency(),
      customerApi.getLtvTrend(),
    ])
      .then(([summaryRes, segRes, topRes, freqRes, ltvRes]) => {
        if (cancelled) return
        const failed = [summaryRes, segRes, topRes, freqRes, ltvRes].filter((r) => r.status === 'rejected')
        if (failed.length === 5) {
          setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
          return
        }
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)
        if (segRes.status === 'fulfilled') {
          const mapped = segRes.value.map((p, i) => ({
            name: mapSegmentName(p.name),
            value: Number(p.value),
            fill: String(p.fill ?? SEGMENT_COLORS[mapSegmentName(p.name)] ?? Object.values(SEGMENT_COLORS)[i % 4]),
          }))
          setSegments(aggregateSegments(mapped))
        }
        if (topRes.status === 'fulfilled') {
          setTopCustomers(topRes.value.map(toTopCustomer))
        }
        if (freqRes.status === 'fulfilled') {
          setFrequencyData(freqRes.value.map((p) => ({ name: p.name, count: Number(p.value) })))
        }
        if (ltvRes.status === 'fulfilled') {
          setLtvTrend(ltvRes.value)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  const loyaltyTiers = useMemo(
    () => segments.map((seg) => ({
      name: seg.name,
      members: seg.value,
      target: Math.max(seg.value, summary?.totalCustomers ?? seg.value),
      color: seg.fill,
      benefit: 'RFM segment',
    })),
    [segments, summary],
  )

  const paginatedCustomers = topCustomers.slice((customerPage - 1) * customerPageSize, customerPage * customerPageSize)

  if (loading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const repeatRate = summary && summary.totalCustomers
    ? Math.round((summary.loyaltyMembers / summary.totalCustomers) * 100)
    : null
  const churnPct = summary && summary.totalCustomers
    ? Math.round((summary.highChurnRisk / summary.totalCustomers) * 100 * 10) / 10
    : null

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={Users}
        title="Customer Analytics"
        subtitle="Segmentation, lifetime value, and loyalty insights"
        actions={(
          <>
            <button type="button" onClick={() => navigate(ROUTES.CUSTOMERS_ALL)} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-on-glass hover:border-copper/40">View All Customers</button>
            <button type="button" onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </>
        )}
      />

      {summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TintedKPICard label="Total Customers" value={summary.totalCustomers.toLocaleString()} tint="copper" trend={<p className={`mt-1 text-xs ${summary.customerGrowth?.startsWith('-') ? 'text-rust-light' : 'text-forest-light'}`}>{summary.customerGrowth || '+0.0% from last month'}</p>} />
          <TintedKPICard label="Avg Customer LTV" value={formatRWF(Number(summary.avgLifetimeValue))} tint="steel" trend={<p className={`mt-1 text-xs ${summary.ltvGrowth?.startsWith('-') ? 'text-rust-light' : 'text-forest-light'}`}>{summary.ltvGrowth || '+0.0% from last month'}</p>} />
          <TintedKPICard label="Repeat Purchase Rate" value={repeatRate != null ? `${repeatRate}%` : '—'} tint="forest" trend={<p className={`mt-1 text-xs ${summary.repeatRateGrowth?.startsWith('-') ? 'text-rust-light' : 'text-forest-light'}`}>{summary.repeatRateGrowth || '+0.0% from last month'}</p>} />
          <TintedKPICard label="Churn Risk" value={summary.highChurnRisk} tint="red" trend={<p className="mt-1 text-xs text-rust-light">{churnPct != null ? `${churnPct}% of customer base` : summary.totalCustomers === 0 ? 'No customers yet' : '—'}</p>} />
        </div>
      ) : (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No customer summary" description="Customer summary data is not available." />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Customer Segmentation</h3>
          <p className="mb-4 text-sm text-on-glass-muted">Distribution by purchase behavior</p>
          {segments.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No segment data" description="Customer segmentation data is not available." />
          ) : (
            <div data-export-chart data-export-chart-title="Customer Segmentation">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                <Pie data={segments} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {segments.map((s, i) => (
                    <Cell key={`${s.name}-${i}`} fill={s.fill ?? SEGMENT_COLORS[s.name] ?? '#6b645c'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(245,243,240,0.7)' }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-on-glass">Purchase Frequency</h3>
          <p className="mb-4 text-sm text-on-glass-muted">Customer distribution by segment</p>
          {frequencyData.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No frequency data" description="Purchase frequency data is not available." />
          ) : (
            <div data-export-chart data-export-chart-title="Purchase Frequency">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={frequencyData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" tick={CHART_TICK} />
                <YAxis type="category" dataKey="name" tick={CHART_TICK} width={80} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="count" name="Customers" fill={FOREST} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="text-lg font-semibold text-on-glass">Lifetime Value Trend</h3>
        <p className="mb-4 text-sm text-on-glass-muted">Average customer LTV over time</p>
        {ltvTrend.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No LTV trend data" description="Lifetime value trend data is not available." />
        ) : (
          <div data-export-chart data-export-chart-title="Lifetime Value Trend">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={ltvTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={CHART_TICK} />
              <YAxis tick={CHART_TICK} tickFormatter={(v) => formatRWF(Number(v))} />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => [formatRWF(Number(v)), 'Avg LTV']} />
              <Line type="monotone" dataKey="ltv" name="Avg LTV" stroke="#B87333" strokeWidth={2.5} dot={{ fill: '#B87333', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="mb-4 text-lg font-semibold text-on-glass">Top 10 Customers by Lifetime Value</h3>
        {topCustomers.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No top customers" description="Top customer data is not available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-on-glass-muted">
                  <th className="pb-3 pr-4 w-12 font-medium">#</th>
                  <th className="pb-3 pr-4 font-medium">Customer</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 text-right font-medium">Orders</th>
                  <th className="pb-3 pr-4 text-right font-medium">LTV</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Churn Risk</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((c, index) => {
                  const churn = getChurnRiskBadge(Number(c.churnRiskScore))
                  return (
                    <tr key={c.customerId} className={`border-b border-white/5 transition-colors hover:bg-white/5 ${!c.isActive ? 'opacity-70' : ''}`}>
                      <td className="py-3 pr-4 text-center text-on-glass-muted">{(customerPage - 1) * customerPageSize + index + 1}</td>
                      <td className="py-3 pr-4">
                        <button type="button" onClick={() => c.isActive && navigate(ROUTES.CUSTOMER(c.customerId))} className="flex items-center gap-3 text-left hover:opacity-80">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-copper/20 text-xs font-bold text-copper-light">{getInitials(c.customerName)}</span>
                          <span className="font-medium text-on-glass">{c.customerName}</span>
                        </button>
                      </td>
                      <td className="py-3 pr-4 capitalize text-on-glass-muted">{c.customerType}</td>
                      <td className="py-3 pr-4 text-right text-on-glass">{c.totalOrders}</td>
                      <td className="py-3 pr-4 text-right font-medium text-on-glass">{formatRWF(Number(c.lifetimeValue))}</td>
                      <td className="py-3 pr-4">
                        {c.tier === 'VIP' ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-copper/30 bg-copper/10 px-2.5 py-0.5 text-xs font-medium text-copper-light">
                            <Crown className="h-3 w-3" />
                            VIP
                          </span>
                        ) : (
                          <StatusBadge variant="info">Regular</StatusBadge>
                        )}
                      </td>
                      <td className="py-3 pr-4"><StatusBadge variant={churn.variant}>{churn.label}</StatusBadge></td>
                      <td className="py-3">
                        {c.isActive ? (
                          <button type="button" onClick={() => setDeactivateTarget(c)} className="text-xs text-rust-light hover:underline">Delete</button>
                        ) : (
                          <>
                            <StatusBadge variant="neutral">Inactive</StatusBadge>
                            <button type="button" onClick={async () => { 
                              try {
                                const updated = await customerApi.reactivate(c.customerId)
                                setTopCustomers((prev) => prev.map((x) => x.customerId === c.customerId ? toTopCustomer(updated) : x))
                                toast(`${c.customerName} reactivated`, 'success')
                              } catch (err) {
                                toast(getErrorMessage(err), 'error')
                              }
                            }} className="ml-2 text-xs text-forest-light hover:underline">Reactivate</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination 
              currentPage={customerPage} 
              totalItems={topCustomers.length} 
              pageSize={customerPageSize} 
              onPageChange={setCustomerPage} 
              onPageSizeChange={setCustomerPageSize} 
              className="mt-4 px-4 pb-4" 
            />
          </div>
        )}
      </GlassCard>

      <GlassCard className="border-copper/20 bg-copper/10 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Crown className="h-5 w-5 text-copper-light" />
          <div>
            <h3 className="text-lg font-semibold text-on-glass">Loyalty Program</h3>
            <p className="text-sm text-on-glass-muted">Tier membership and capacity</p>
          </div>
        </div>
        {loyaltyTiers.length === 0 ? (
          <EmptyState icon={<Crown className="h-6 w-6" />} title="No loyalty data" description="Loyalty program data is not available." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loyaltyTiers.map((tier) => (
              <div key={tier.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-on-glass">{tier.name}</p>
                  <span className="text-xs text-on-glass-muted">{tier.benefit}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-on-glass">{tier.members}</p>
                <p className="text-xs text-on-glass-muted">of {tier.target} capacity</p>
                <ProgressBar value={tier.members} max={tier.target} color={tier.color} className="mt-3" />
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Customer Analytics"
        resolveExportData={fetchCustomerExportData}
      />

      <DeactivateConfirmModal
        isOpen={!!deactivateTarget}
        itemName={deactivateTarget?.customerName ?? 'this customer'}
        onConfirm={async () => {
          if (deactivateTarget) {
            try {
              const updated = await customerApi.deactivate(deactivateTarget.customerId)
              setTopCustomers((prev) => prev.map((x) => x.customerId === deactivateTarget.customerId ? toTopCustomer(updated) : x))
              toast(`${deactivateTarget.customerName} has been deactivated.`, 'success')
            } catch (err) {
              toast(getErrorMessage(err), 'error')
            }
          }
          setDeactivateTarget(null)
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  )
}
