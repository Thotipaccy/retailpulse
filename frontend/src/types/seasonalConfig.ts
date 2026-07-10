// Shared config types and persistence helpers for Seasonal Recommendations.
// Kept in a separate file so the modal can export only a component (Fast Refresh requirement).

const STORAGE_KEY = 'retailpulse_seasonal_config'

export interface SeasonalConfig {
  enabled: boolean
  minConfidence: number
  maxProducts: number
  displayDays: number
  autoRefresh: boolean
}

export const DEFAULT_CONFIG: SeasonalConfig = {
  enabled: true,
  minConfidence: 70,
  maxProducts: 8,
  displayDays: 30,
  autoRefresh: true,
}

export function loadSeasonalConfig(): SeasonalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    // ignore corrupt data
  }
  return DEFAULT_CONFIG
}

export function saveSeasonalConfig(cfg: SeasonalConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}
