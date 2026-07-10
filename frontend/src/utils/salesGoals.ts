export type SalesPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

const PERIOD_KEYS: Record<SalesPeriod, string> = {
  daily: 'salesGoal_daily',
  weekly: 'salesGoal_weekly',
  monthly: 'salesGoal_monthly',
  yearly: 'salesGoal_yearly',
}

const LEGACY_KEY = 'retailpulse-sales-goals'

export type SalesGoals = Partial<Record<SalesPeriod, number>>

function readGoal(key: string): number | undefined {
  const raw = localStorage.getItem(key)
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

function migrateLegacyGoals(): SalesGoals {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SalesGoals
    for (const period of Object.keys(PERIOD_KEYS) as SalesPeriod[]) {
      const amount = parsed[period]
      if (typeof amount === 'number' && amount > 0) {
        localStorage.setItem(PERIOD_KEYS[period], String(amount))
      }
    }
    localStorage.removeItem(LEGACY_KEY)
    return parsed
  } catch {
    return {}
  }
}

export function loadSalesGoals(): SalesGoals {
  migrateLegacyGoals()
  const goals: SalesGoals = {}
  for (const period of Object.keys(PERIOD_KEYS) as SalesPeriod[]) {
    const amount = readGoal(PERIOD_KEYS[period])
    if (amount !== undefined) goals[period] = amount
  }
  return goals
}

export function saveSalesGoal(period: SalesPeriod, amount: number) {
  localStorage.setItem(PERIOD_KEYS[period], String(amount))
}

export function clearSalesGoal(period: SalesPeriod) {
  localStorage.removeItem(PERIOD_KEYS[period])
}
