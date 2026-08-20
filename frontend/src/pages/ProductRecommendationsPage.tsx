import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Brain,
  Download,
  Filter,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react'
import { recommendationApi } from '../services/recommendationApi'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { TabNav } from '../components/ui/TabNav'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchRecommendationsExportData } from '../services/exportDataService'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { getErrorMessage } from '../services/api'
import { RecommendationsConfigModal } from '../components/modals/RecommendationsConfigModal'
import { Pagination } from '../components/ui/Pagination'
import {
  loadSeasonalConfig,
  saveSeasonalConfig,
  type SeasonalConfig,
} from '../types/seasonalConfig'

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>

type TabId = 'seasonal' | 'fbt' | 'upsell' | 'personalized'

interface RecSummary {
  totalRecommendations: number
  avgConfidence: number
  aiPowered: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: unknown): number {
  const n = Number(v ?? 0)
  return n > 1 ? Math.round(n) : Math.round(n * 100)
}

function confidenceBadge(score: unknown) {
  const p = pct(score)
  if (p >= 80) return <StatusBadge variant="success">{p}%</StatusBadge>
  if (p >= 60) return <StatusBadge variant="warning">{p}%</StatusBadge>
  return <StatusBadge variant="danger">{p}%</StatusBadge>
}

function str(v: unknown, fallback = '—') {
  const s = String(v ?? '')
  return s.trim() || fallback
}

const SEASON_ORDER = ['Spring', 'Summer', 'Autumn', 'Winter']
const SEASON_EMOJI: Record<string, string> = {
  Spring: '🌱',
  Summer: '☀️',
  Autumn: '🍂',
  Winter: '❄️',
}

function normalizeSeason(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('spring')) return 'Spring'
  if (lower.includes('summer')) return 'Summer'
  if (lower.includes('autumn') || lower.includes('fall')) return 'Autumn'
  if (lower.includes('winter')) return 'Winter'
  return name
}

function currentSeasonName(): string {
  const month = new Date().getMonth() + 1
  if (month === 12 || month <= 2) return 'Winter'
  if (month <= 5) return 'Spring'
  if (month <= 8) return 'Summer'
  return 'Autumn'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductRecommendationsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('seasonal')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [config, setConfig] = useState<SeasonalConfig>(loadSeasonalConfig)

  // Raw data per tab
  const [seasonal, setSeasonal] = useState<RawRow[]>([])
  const [fbt, setFbt] = useState<RawRow[]>([])
  const [upsell, setUpsell] = useState<RawRow[]>([])
  const [personalized, setPersonalized] = useState<RawRow[]>([])
  const [summary, setSummary] = useState<RecSummary | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [seasonFilter, setSeasonFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    Promise.all([
      recommendationApi.getSeasonal(),
      recommendationApi.getFbt(),
      recommendationApi.getUpsell(),
      recommendationApi.getPersonalized(),
      recommendationApi.getSummary(),
    ])
      .then(([s, f, u, p, sum]) => {
        if (cancelled) return
        setSeasonal(s)
        setFbt(f)
        setUpsell(u)
        setPersonalized(p)
        setSummary(sum as unknown as RecSummary)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])


  const handleConfigSave = (newCfg: SeasonalConfig) => {
    saveSeasonalConfig(newCfg)
    setConfig(newCfg)
    if (newCfg.enabled && newCfg.autoRefresh) load()
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const currentRows = useMemo(() => {
    switch (activeTab) {
      case 'seasonal': return seasonal
      case 'fbt': return fbt
      case 'upsell': return upsell
      case 'personalized': return personalized
    }
  }, [activeTab, seasonal, fbt, upsell, personalized])

  const categories = useMemo(() => {
    const cats = new Set(currentRows.map((r) => str(r.category, '')).filter(Boolean))
    return ['all', ...Array.from(cats).sort()]
  }, [currentRows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return currentRows.filter((row) => {
      const confPct = pct(row.confidenceScore)
      if (categoryFilter !== 'all' && str(row.category, '') !== categoryFilter) return false
      if (seasonFilter !== 'all' && normalizeSeason(str(row.season, '')) !== seasonFilter) return false
      if (confidenceFilter === 'high' && confPct < 80) return false
      if (confidenceFilter === 'medium' && (confPct < 60 || confPct >= 80)) return false
      if (confidenceFilter === 'low' && confPct >= 60) return false
      if (q) {
        const haystack = [
          str(row.recommendedProduct),
          str(row.sourceProduct),
          str(row.category),
          str(row.season),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [currentRows, search, categoryFilter, confidenceFilter, seasonFilter])

  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  )

  // ── Seasonal grouping for the season cards row ───────────────────────────────

  const seasonCards = useMemo(() => {
    const bySeason = new Map<string, RawRow[]>()
    const minFrac = config.minConfidence / 100
    const eligible = seasonal.filter((r) => {
      const conf = Number(r.confidenceScore ?? 0)
      return (conf > 1 ? conf / 100 : conf) >= minFrac
    })
    for (const row of eligible) {
      const s = normalizeSeason(str(row.season, 'Other'))
      bySeason.set(s, [...(bySeason.get(s) ?? []), row])
    }
    return SEASON_ORDER.map((s) => ({
      season: s,
      rows: (bySeason.get(s) ?? []).slice(0, config.maxProducts),
    }))
  }, [seasonal, config])

  const activeSeason = currentSeasonName()

  // ── Tabs definition ──────────────────────────────────────────────────────────

  // Avg confidence computed from ALL loaded recommendation rows — no hardcoding
  const avgConfidencePct = useMemo(() => {
    const all = [...seasonal, ...fbt, ...upsell, ...personalized]
    if (all.length === 0) return null
    const total = all.reduce((sum, r) => {
      const v = Number(r.confidenceScore ?? 0)
      return sum + (v > 1 ? v / 100 : v)
    }, 0)
    return Math.round((total / all.length) * 100)
  }, [seasonal, fbt, upsell, personalized])

  const tabs = [
    { id: 'seasonal' as TabId, label: '🌿 Seasonal', count: seasonal.length },
    { id: 'fbt' as TabId, label: '🔗 Frequently Bought Together', count: fbt.length },
    { id: 'upsell' as TabId, label: '📈 Upsell', count: upsell.length },
    { id: 'personalized' as TabId, label: '✨ Personalized', count: personalized.length },
  ]

  // Helper: change tab and reset all filters + page atomically (no useEffect needed)
  const changeTab = (t: TabId) => {
    setActiveTab(t)
    setSearch('')
    setCategoryFilter('all')
    setConfidenceFilter('all')
    setSeasonFilter('all')
    setCurrentPage(1)
  }

  // Helper: filter change + page reset in one call
  const applyFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setCurrentPage(1) }

  // ── Render guards ────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <ModulePageHeader
        icon={ThumbsUp}
        title="Product Recommendations"
        subtitle="AI-powered product suggestions across seasonal, cross-sell, upsell, and personalized strategies"
        actions={
          <>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg glass-subtle px-3 py-2 text-sm text-on-glass hover:glass"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg glass-subtle px-4 py-2 text-sm font-medium text-on-glass hover:glass"
            >
              <Settings className="h-4 w-4" />
              Configure
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-copper/20">
            <Sparkles className="h-5 w-5 text-copper-light" />
          </div>
          <div>
            <p className="text-xs text-on-glass-muted">Total Recommendations</p>
            <p className="text-2xl font-bold text-on-glass">{summary?.totalRecommendations ?? (seasonal.length + fbt.length + upsell.length + personalized.length)}</p>
          </div>
        </GlassCard>
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest/20">
            <TrendingUp className="h-5 w-5 text-forest-light" />
          </div>
          <div>
            <p className="text-xs text-on-glass-muted">Avg Confidence</p>
            <p className="text-2xl font-bold text-on-glass">
              {avgConfidencePct != null ? `${avgConfidencePct}%` : '—'}
            </p>
            <p className="text-xs text-on-glass-muted">across all {seasonal.length + fbt.length + upsell.length + personalized.length} recommendations</p>
          </div>
        </GlassCard>
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ochre/20">
            <Star className="h-5 w-5 text-ochre" />
          </div>
          <div>
            <p className="text-xs text-on-glass-muted">Current Season</p>
            <p className="text-xl font-bold text-on-glass">{SEASON_EMOJI[activeSeason]} {activeSeason}</p>
          </div>
        </GlassCard>
        <GlassCard className="p-4 flex items-center gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            summary == null ? 'bg-white/5' : summary.aiPowered ? 'bg-steel/20' : 'bg-rust/10'
          }`}>
            <Brain className={`h-5 w-5 ${
              summary == null ? 'text-on-glass-muted' : summary.aiPowered ? 'text-steel-light' : 'text-rust-light'
            }`} />
          </div>
          <div>
            <p className="text-xs text-on-glass-muted">AI Service</p>
            {summary == null ? (
              <p className="text-sm text-on-glass-muted">Loading…</p>
            ) : summary.aiPowered ? (
              <>
                <p className="text-sm font-semibold text-forest-light">● Online</p>
                <p className="text-xs text-on-glass-muted">AI inference active</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-rust-light">● Offline</p>
                <p className="text-xs text-on-glass-muted">Using local fallback</p>
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Seasonal Overview Cards */}
      {config.enabled && (
        <GlassCard className="border-copper/15 bg-copper/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-on-glass">Seasonal Overview</h2>
              <p className="text-xs text-on-glass-muted mt-0.5">Top products per season · min confidence {config.minConfidence}%</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {seasonCards.map((card) => {
              const isCurrent = card.season === activeSeason
              return (
                <div
                  key={card.season}
                  className={`rounded-xl border p-4 transition-all ${
                    isCurrent
                      ? 'border-copper/40 bg-copper/10 ring-1 ring-copper/30'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-on-glass text-sm">
                      {SEASON_EMOJI[card.season]} {card.season}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-copper/20 px-2 py-0.5 text-xs font-medium text-copper-light">Current</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-on-glass-muted">{card.rows.length} product{card.rows.length !== 1 ? 's' : ''}</p>
                  <ul className="mt-3 space-y-1">
                    {card.rows.length === 0 ? (
                      <li className="text-xs text-on-glass-muted italic">No data yet</li>
                    ) : (
                      card.rows.map((r, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-on-glass">
                          <span className="h-1 w-1 shrink-0 rounded-full bg-copper-light" />
                          {str(r.recommendedProduct)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* Main Table Section */}
      <GlassCard className="p-5">
        <TabNav tabs={tabs} active={activeTab} onChange={changeTab} />

        {/* Filter Bar */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-glass-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab} recommendations…`}
              className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-on-glass-muted" />

            {activeTab === 'seasonal' && (
              <select
                value={seasonFilter}
                onChange={(e) => applyFilter(setSeasonFilter)(e.target.value)}
                title="Filter by season"
                className="glass-input rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Seasons</option>
                {SEASON_ORDER.map((s) => <option key={s} value={s}>{SEASON_EMOJI[s]} {s}</option>)}
              </select>
            )}

            <select
              value={categoryFilter}
              onChange={(e) => applyFilter(setCategoryFilter)(e.target.value)}
              title="Filter by category"
              className="glass-input rounded-lg px-3 py-2 text-sm"
            >
              {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>

            <select
              value={confidenceFilter}
              onChange={(e) => applyFilter(setConfidenceFilter)(e.target.value as typeof confidenceFilter)}
              title="Filter by confidence"
              className="glass-input rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Confidence</option>
              <option value="high">High ≥80%</option>
              <option value="medium">Medium 60–79%</option>
              <option value="low">Low &lt;60%</option>
            </select>
          </div>

          <span className="shrink-0 text-xs text-on-glass-muted">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ThumbsUp className="h-6 w-6" />}
            title="No recommendations found"
            description="Try adjusting filters or refreshing the data."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-on-glass-muted">
                    <th className="px-4 py-3 font-medium w-10">#</th>
                    {activeTab === 'seasonal' && <th className="px-4 py-3 font-medium">Season</th>}
                    <th className="px-4 py-3 font-medium">
                      {activeTab === 'fbt' ? 'Source Product' : activeTab === 'upsell' ? 'Current Product' : 'Recommended Product'}
                    </th>
                    {(activeTab === 'fbt' || activeTab === 'upsell') && <th className="px-4 py-3 font-medium">Recommended Product</th>}
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    {activeTab === 'fbt' && <th className="px-4 py-3 text-right font-medium">Co-occurrences</th>}
                    {activeTab === 'seasonal' && <th className="px-4 py-3 text-right font-medium">Predicted Demand</th>}
                    {activeTab === 'seasonal' && <th className="px-4 py-3 text-right font-medium">Season Share</th>}
                    <th className="px-4 py-3 font-medium">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-on-glass-muted">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>

                      {activeTab === 'seasonal' && (
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            normalizeSeason(str(row.season)) === activeSeason
                              ? 'bg-copper/20 text-copper-light'
                              : 'bg-white/10 text-on-glass-muted'
                          }`}>
                            {SEASON_EMOJI[normalizeSeason(str(row.season))] ?? ''} {str(row.season)}
                          </span>
                        </td>
                      )}

                      <td className="px-4 py-3 font-medium text-on-glass">
                        <div className="flex items-center gap-2">
                          {(activeTab === 'fbt' || activeTab === 'upsell')
                            ? str(row.sourceProduct)
                            : str(row.recommendedProduct)}
                        </div>
                      </td>

                      {(activeTab === 'fbt' || activeTab === 'upsell') && (
                        <td className="px-4 py-3 text-on-glass">
                          <div className="flex items-center gap-1.5">
                            <ArrowUpRight className="h-3 w-3 shrink-0 text-copper-light" />
                            {str(row.recommendedProduct)}
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-3 text-on-glass-muted">{str(row.category) || '—'}</td>

                      <td className="px-4 py-3">{confidenceBadge(row.confidenceScore)}</td>

                      {activeTab === 'fbt' && (
                        <td className="px-4 py-3 text-right text-on-glass">
                          {row.coOccurrences != null ? String(row.coOccurrences) : '—'}
                        </td>
                      )}
                      {activeTab === 'seasonal' && (
                        <td className="px-4 py-3 text-right text-on-glass">
                          {row.predictedDemand != null ? Number(row.predictedDemand).toLocaleString() : '—'}
                        </td>
                      )}
                      {activeTab === 'seasonal' && (
                        <td className="px-4 py-3 text-right">
                          {row.seasonalShare != null
                            ? <span className="text-xs text-on-glass-muted">{Math.round(Number(row.seasonalShare) * 100)}%</span>
                            : <span className="text-xs text-on-glass-muted">—</span>}
                        </td>
                      )}

                      <td className="px-4 py-3">
                        {row.aiPowered
                          ? <span className="flex items-center gap-1 text-xs text-steel-light"><Brain className="h-3 w-3" />AI</span>
                          : <span className="text-xs text-on-glass-muted">Local</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </GlassCard>

      {/* Personalized insights blurb */}
      {activeTab === 'personalized' && personalized.length > 0 && (
        <GlassCard className="flex items-start gap-4 p-4 border-copper/15 bg-copper/5">
          <Users className="h-5 w-5 shrink-0 text-copper-light mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-on-glass">Personalized Recommendations</p>
            <p className="text-xs text-on-glass-muted mt-1">
              These suggestions are derived from customer purchase history and AI behavioral analysis.
              Use them to tailor upsell offers at the point of sale.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Recommendations"
        fileName="recommendations"
        resolveExportData={fetchRecommendationsExportData}
      />

      {/* Config Modal */}
      <RecommendationsConfigModal
        key={String(configOpen)}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSave={handleConfigSave}
        initialConfig={config}
      />
    </div>
  )
}
