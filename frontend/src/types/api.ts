import type { User } from './index'

export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
  timestamp: string
}

export interface LoginResult {
  requires2FA: boolean
  tempToken?: string
  accessToken?: string
  refreshToken?: string
  user?: User
}

export interface TokenResult {
  accessToken: string
  refreshToken?: string
}

export interface DashboardSummary {
  kpis: Array<{
    id: string
    label: string
    value: string
    trend: number
    trendLabel: string
    icon: string
  }>
}

export interface SalesOverview {
  periodRevenue: number
  growthRate: number
  totalUnits: number
  trend: Array<{ name: string; value: number }>
}

export interface ChartPoint {
  name: string
  value: number
  fill?: string
  [key: string]: string | number | undefined
}

export interface HeatmapPoint {
  day: string
  hour: string
  value: number
}

export interface InventorySummary {
  totalProducts: number
  healthy: number
  low: number
  critical: number
  overstock: number
}

export interface StockItem {
  productId: string
  skuCode?: string
  productName: string
  category: string
  unitPrice: number
  quantityOnHand: number
  reorderPoint: number
  stockStatus: string
  stockoutRisk?: number
  priority?: string
  suggestedOrder?: number
  supplierInsight?: string
  daysUntilStockout?: number
  isActive?: boolean
}

export interface PurchaseHistoryItem {
  purchaseId?: string
  date: string
  quantity: number
  unitCost: number
  supplier: string
  totalCost: number
  supplierContact?: string
  invoiceNumber?: string
}

export interface CustomerSummary {
  totalCustomers: number
  activeCustomers: number
  loyaltyMembers: number
  avgLifetimeValue: string | number
  highChurnRisk: number
  aiPowered?: boolean
  customerGrowth?: string
  ltvGrowth?: string
  repeatRateGrowth?: string
  churnRiskGrowth?: string
}

export interface ForecastPoint {
  date: string
  predicted?: number
  lower?: number
  upper?: number
  actual?: number
}

export interface ForecastStatus {
  historicalDaysAvailable: number
  dataSufficient: boolean
  requiredDays: number
  dataLevel?: 'none' | 'low' | 'limited' | 'optimal'
  aiServiceHealthy: boolean
  modelsReady: boolean
  lastTrained?: string | null
  mape?: number
  categories: Array<{ id: string; name: string }>
  products: Array<{ id: string; name: string; category: string }>
}

export interface ForecastAccuracy {
  overall: number
  weeklyPrecision: number
  seasonalDetection: number
  mape: number
  accuracy: number
  aiPowered: boolean
  modelsReady: boolean
}

export interface ProductForecastRow {
  productId: string
  productName: string
  category: string
  currentStock: number
  predictedDemand: number
  reorderDelta: number | null
  confidence: number
  status: 'urgent' | 'reorder' | 'monitor' | 'adequate'
}

export interface DemandForecastResult {
  chart: ForecastPoint[]
  mape: number
  aiPowered: boolean
  fallbackUsed: boolean
  lowConfidence: boolean
  productForecasts: ProductForecastRow[]
  insights: string
  historicalDays: number
  horizon: string
  scope: string
  warning?: string
  message?: string
  empty?: boolean
}

export interface ReportTemplate {
  id: string
  name: string
  description: string
  formats: string[]
}

export interface SystemHealth {
  status: string
  database: string
  apiVersion: string
  uptime?: string
  lastBackup?: string | null
  activeUsers: number
}
