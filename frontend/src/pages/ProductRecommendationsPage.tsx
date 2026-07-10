import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Settings, ThumbsUp } from 'lucide-react'
import { recommendationApi } from '../services/recommendationApi'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { GlassCard } from '../components/ui/GlassCard'
import { ExportModal } from '../components/ui/ExportModal'
import { fetchRecommendationsExportData } from '../services/exportDataService'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { getErrorMessage } from '../services/api'
import { RecommendationsConfigModal } from '../components/modals/RecommendationsConfigModal'
import {
  loadSeasonalConfig,
  saveSeasonalConfig,
  type SeasonalConfig,
} from '../types/seasonalConfig'

type SeasonCard = {
  season: string
  products: string[]
  lift: string
  tint: 'copper' | 'forest' | 'steel' | 'ochre'
}

const SEASON_ORDER = ['Spring', 'Summer', 'Autumn', 'Winter']

function currentSeasonName(): string {
  const month = new Date().getMonth() + 1
  if (month === 12 || month <= 2) return 'Winter'
  if (month <= 5) return 'Spring'
  if (month <= 8) return 'Summer'
  return 'Autumn'
}

const SEASON_TINTS: Record<string, SeasonCard['tint']> = {
  Spring: 'forest',
  Summer: 'ochre',
  Autumn: 'copper',
  Winter: 'steel',
}

function normalizeSeason(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('spring')) return 'Spring'
  if (lower.includes('summer')) return 'Summer'
  if (lower.includes('autumn') || lower.includes('fall')) return 'Autumn'
  if (lower.includes('winter')) return 'Winter'
  return name
}

function buildCards(rows: Record<string, unknown>[], config: SeasonalConfig): SeasonCard[] {
  const minFrac = config.minConfidence / 100
  const filtered = rows.filter((row) => {
    const conf = Number(row.confidenceScore ?? row.confidence ?? 1)
    const normalised = conf > 1 ? conf / 100 : conf
    return normalised >= minFrac
  })

  const bySeason = new Map<string, Record<string, unknown>[]>()
  for (const row of filtered) {
    const season = normalizeSeason(String(row.season ?? 'Season'))
    bySeason.set(season, [...(bySeason.get(season) ?? []), row])
  }

  return SEASON_ORDER.map((season, i) => {
    const seasonRows = (bySeason.get(season) ?? []).slice(0, config.maxProducts)
    const products = seasonRows.map((r) =>
      String(r.recommendedProduct ?? r.sourceProduct ?? r.productName ?? 'Product'),
    )
    const avgConf =
      seasonRows.length > 0
        ? seasonRows.reduce((s, r) => s + Number(r.confidenceScore ?? r.confidence ?? 0), 0) /
          seasonRows.length
        : 0
    const pct = avgConf <= 1 ? Math.round(avgConf * 100) : Math.round(avgConf)
    return {
      season,
      products: products.length ? products : ['No products flagged yet'],
      lift: pct > 0 ? `+${pct}% demand confidence` : 'Seasonal demand',
      tint: SEASON_TINTS[season] ?? (['forest', 'ochre', 'copper', 'steel'][i] as SeasonCard['tint']),
    }
  })
}

export function ProductRecommendationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [config, setConfig] = useState<SeasonalConfig>(loadSeasonalConfig)

  // Derive display data from rawRows + config — no setState in effects needed
  const seasonal = useMemo(
    () => (config.enabled ? buildCards(rawRows, config) : []),
    [rawRows, config],
  )

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    recommendationApi
      .getSeasonal()
      .then((rows) => {
        if (cancelled) return
        setRawRows(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Only fetch when the feature is enabled
  useEffect(() => {
    if (!config.enabled) return
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load, config.enabled])

  const handleConfigSave = (newCfg: SeasonalConfig) => {
    saveSeasonalConfig(newCfg)
    setConfig(newCfg)
    // Re-fetch from server when autoRefresh is on
    if (newCfg.enabled && newCfg.autoRefresh) {
      load()
    }
  }

  if (loading && config.enabled) return <LoadingSkeleton rows={4} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const activeSeason = currentSeasonName()

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={ThumbsUp}
        title="Product Recommendations"
        subtitle="Seasonal demand-based product suggestions"
        actions={
          <>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg glass-subtle px-4 py-2 text-sm font-medium text-on-glass hover:bg-white/10"
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

      {!config.enabled && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-on-glass-muted">
          Seasonal recommendations are currently{' '}
          <strong className="text-on-glass">disabled</strong>. Click{' '}
          <strong className="text-copper-light">Configure</strong> to re-enable them.
        </div>
      )}

      <GlassCard className="border-copper/15 bg-copper/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-on-glass">Seasonal Recommendations</h2>
            <p className="mt-1 text-sm text-on-glass-muted">
              Product suggestions aligned with seasonal demand patterns at Quincaillerie du Rwamagana
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-on-glass-muted">
            <span>
              Min confidence:{' '}
              <strong className="text-copper-light">{config.minConfidence}%</strong>
            </span>
            <span>
              Max per season:{' '}
              <strong className="text-copper-light">{config.maxProducts}</strong>
            </span>
          </div>
        </div>

        {seasonal.length === 0 ? (
          <EmptyState
            icon={<ThumbsUp className="h-6 w-6" />}
            title="No seasonal data"
            description="Seasonal recommendation data is not available."
          />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seasonal.map((card) => (
              <TintedKPICard
                key={card.season}
                label={card.season === activeSeason ? `${card.season} (Current)` : card.season}
                value={card.lift}
                tint={card.tint}
                subtitle={card.products.join(' · ')}
              />
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-on-glass">Seasonal Product Details</h2>
        <p className="mt-1 text-sm text-on-glass-muted">
          Recommended products by season based on historical sales patterns
        </p>
        {seasonal.every((c) => c.products.length === 1 && c.products[0] === 'No products flagged yet') ? (
          <EmptyState
            icon={<ThumbsUp className="h-6 w-6" />}
            title="No product suggestions"
            description="Import sales data and run analytics to populate seasonal recommendations."
          />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {seasonal.map((card) => (
              <div
                key={card.season}
                className={`rounded-xl border p-4 ${
                  card.season === activeSeason
                    ? 'border-copper/40 bg-copper/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-on-glass">
                    {card.season}
                    {card.season === activeSeason ? ' · Current season' : ''}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      card.lift === 'Seasonal demand'
                        ? 'bg-white/10 text-on-glass-muted'
                        : 'bg-copper/20 text-copper-light'
                    }`}
                  >
                    {card.lift}
                  </span>
                </div>
                <p className="mt-1 text-xs text-on-glass-muted">
                  {card.products.filter((p) => p !== 'No products flagged yet').length} top product
                  {card.products.length !== 1 ? 's' : ''} this season
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-on-glass">
                  {card.products.map((p) => (
                    <li key={`${card.season}-${p}`} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-copper-light" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Recommendations"
        fileName="recommendations"
        resolveExportData={fetchRecommendationsExportData}
      />

      {/* key=configOpen forces the modal to remount on open so it always picks up
          the latest initialConfig without needing a useEffect setState inside it */}
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
