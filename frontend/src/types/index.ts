export type UserRole = 'administrator' | 'manager' | 'analyst' | 'viewer'

export interface User {
  userId: string
  id?: string
  fullName: string
  email: string
  stores?: string[]
  role: UserRole
  isActive: boolean
  lastLogin?: string
  avatarDataUrl?: string
  phone?: string
  department?: string
  createdAt?: string
  twoFactorEnabled?: boolean
}

export interface AuthResponse {
  token: string
  user: User
}

export interface KPIData {
  id: string
  label: string
  value: string
  trend: number
  trendLabel: string
  icon: string
}

export interface Transaction {
  transactionId: string
  customerName: string
  productSummary: string
  totalAmount: number
  paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer' | 'credit'
  transactionDate: string
  status: 'completed' | 'pending' | 'refunded'
}

export interface Product {
  productId: string
  skuCode: string
  productName: string
  category: string
  unitPrice: number
  quantityOnHand: number
  reorderPoint: number
  stockStatus: 'healthy' | 'low' | 'critical' | 'overstock'
}

export interface Customer {
  customerId: string
  customerName: string
  customerType: 'retail' | 'contractor' | 'wholesale'
  phone: string
  email: string
  lifetimeValue: number
  churnRiskScore: number
  rfmSegment: 'Champions' | 'Loyal' | 'At Risk' | 'Dormant' | 'Lost'
  lastPurchaseDate: string
  totalOrders: number
  isActive?: boolean
}

export interface UploadRecord {
  uploadId: string
  fileName: string
  uploadedAt: string
  recordCount: number
  qualityScore: number
  status: 'success' | 'processing' | 'failed'
}

export interface Alert {
  alertId: string
  alertType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  isRead: boolean
  createdAt: string
}

export interface Report {
  reportId: string
  reportType: string
  format: 'pdf' | 'excel' | 'csv' | 'pptx'
  generatedAt: string
  status: 'ready' | 'generating' | 'failed' | 'expired'
  fileName?: string
  filterSummary?: string
}

export interface ForecastPoint {
  date: string
  predicted: number
  lower: number
  upper: number
  actual?: number
}

export interface ProductRecommendation {
  recommendationId: string
  sourceProduct: string
  recommendedProduct: string
  category: string
  confidenceScore: number
}

export interface Store {
  storeId: string
  storeName: string
  location: string
  province: string
}

export interface Scenario {
  scenarioId: string
  name: string
  priceChange: number
  promotionDiscount: number
  period: string
  predictedRevenue: number
  roi: number
}

export interface AuditLog {
  logId: string
  userId: string
  userName: string
  actionType: string
  description: string
  createdAt: string
}

export interface ChartDataPoint {
  name: string
  value: number
  [key: string]: string | number
}

export interface NavItem {
  path: string
  label: string
  icon: string
  roles: UserRole[]
}

export interface DateRange {
  label: string
  value: 'today' | 'week' | 'month' | 'custom'
}
