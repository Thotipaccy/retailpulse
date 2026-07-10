import type { ExportData, ExportSection } from '../types/export'
import { formatRWF } from '../utils/format'
import { customerApi } from './customerApi'
import { dashboardApi } from './dashboardApi'
import { forecastApi } from './forecastApi'
import { inventoryApi } from './inventoryApi'
import { productApi } from './productApi'
import { recommendationApi } from './recommendationApi'
import { salesApi } from './salesApi'

type ExportOptions = Record<string, boolean>

function includeSummary(options: ExportOptions) {
  return options['Include Summary'] !== false
}

function includeCharts(options: ExportOptions) {
  return options['Include Charts'] !== false
}

function includeRaw(options: ExportOptions) {
  return options['Include Raw Data'] !== false
}

function includeAi(options: ExportOptions) {
  return Boolean(options['Include AI Recommendations'])
}

function section(heading: string, lines?: string[], table?: ExportSection['table']): ExportSection {
  return { heading, lines, table }
}

function chartTable(title: string, points: Array<{ name: string; value: number }>): ExportSection['table'] {
  return {
    title,
    headers: ['Label', 'Value'],
    rows: points.map((p) => [p.name, p.value]),
  }
}

export async function fetchInventoryExportData(options: ExportOptions): Promise<ExportData> {
  const [summaryRes, stockRes, risksRes, reorderRes, turnoverRes, velocityRes] = await Promise.allSettled([
    inventoryApi.getSummary(),
    inventoryApi.getStockLevels(),
    inventoryApi.getStockoutRisks(),
    inventoryApi.getReorderRecommendations(),
    inventoryApi.getTurnover(),
    inventoryApi.getVelocity(),
  ])

  const sections: ExportSection[] = []
  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null

  if (includeSummary(options) && summary) {
    sections.push(section('Inventory Summary', [
      `Total products tracked: ${summary.totalProducts}`,
      `Healthy stock: ${summary.healthy}`,
      `Low stock: ${summary.low}`,
      `Critical: ${summary.critical}`,
      `Overstock: ${summary.overstock}`,
    ]))
  }

  if (includeCharts(options) && turnoverRes.status === 'fulfilled' && turnoverRes.value.length) {
    sections.push(section('Turnover by Category', undefined, chartTable(
      'Turnover',
      turnoverRes.value.map((p) => ({ name: p.name, value: Number(p.value) })),
    )))
  }

  if (includeCharts(options) && velocityRes.status === 'fulfilled') {
    const v = velocityRes.value
    if (v.monthly.length) {
      sections.push(section('Monthly Units Sold', undefined, {
        title: 'Velocity',
        headers: ['Month', 'Units Sold'],
        rows: v.monthly.map((m) => [m.month, m.unitsSold]),
      }))
    }
    if (v.fastMovers.length) {
      sections.push(section('Fast Movers', undefined, {
        title: 'Fast Movers',
        headers: ['Category', 'Units', 'Revenue (RWF)'],
        rows: v.fastMovers.map((m) => [m.category, m.unitsSold, formatRWF(m.revenue)]),
      }))
    }
    if (v.slowMovers.length) {
      sections.push(section('Slow Movers', undefined, {
        title: 'Slow Movers',
        headers: ['Category', 'Units', 'Revenue (RWF)'],
        rows: v.slowMovers.map((m) => [m.category, m.unitsSold, formatRWF(m.revenue)]),
      }))
    }
  }

  if (includeRaw(options) && stockRes.status === 'fulfilled' && stockRes.value.length) {
    sections.push(section('Stock Levels', undefined, {
      title: 'Stock',
      headers: ['Product', 'SKU', 'Category', 'Qty', 'Reorder', 'Status', 'Unit Price'],
      rows: stockRes.value.map((s) => [
        s.productName,
        s.skuCode ?? '',
        s.category,
        s.quantityOnHand,
        s.reorderPoint,
        s.stockStatus,
        formatRWF(Number(s.unitPrice)),
      ]),
    }))
  }

  if (includeAi(options)) {
    if (risksRes.status === 'fulfilled' && risksRes.value.length) {
      sections.push(section('AI Stockout Risks', undefined, {
        title: 'Stockout Risks',
        headers: ['Product', 'Category', 'Qty', 'Risk Score', 'Status'],
        rows: risksRes.value.map((s) => [
          s.productName,
          s.category,
          s.quantityOnHand,
          s.stockoutRisk != null ? `${Math.round(s.stockoutRisk * 100)}%` : 'N/A',
          s.stockStatus,
        ]),
      }))
    }
    if (reorderRes.status === 'fulfilled' && reorderRes.value.length) {
      sections.push(section('Reorder Recommendations', undefined, {
        title: 'Reorder',
        headers: ['Product', 'Suggested Qty', 'Priority', 'Unit Price'],
        rows: reorderRes.value.map((s) => [
          s.productName,
          s.suggestedOrder ?? s.reorderPoint,
          s.priority ?? s.stockStatus,
          formatRWF(Number(s.unitPrice)),
        ]),
      }))
    }
  }

  return { title: 'Inventory Status Report', subtitle: 'Live data from RetailPulse inventory APIs', sections }
}

export async function fetchSalesExportData(options: ExportOptions): Promise<ExportData> {
  const [overviewRes, categoryRes, paymentRes, topRes, heatmapRes] = await Promise.allSettled([
    salesApi.getOverview('monthly'),
    salesApi.getByCategory(),
    salesApi.getByPaymentMethod(),
    salesApi.getTopProducts(20),
    salesApi.getHeatmap(),
  ])

  const sections: ExportSection[] = []
  const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : null

  if (includeSummary(options) && overview) {
    sections.push(section('Sales Summary', [
      `Period revenue: ${formatRWF(overview.periodRevenue)}`,
      `Growth rate: ${overview.growthRate}%`,
      `Total units sold: ${overview.totalUnits.toLocaleString()}`,
    ]))
  }

  if (includeCharts(options) && overview?.trend?.length) {
    sections.push(section('Revenue Trend', undefined, chartTable(
      'Trend',
      overview.trend.map((p) => ({ name: p.name, value: Number(p.value) })),
    )))
  }

  if (includeCharts(options) && categoryRes.status === 'fulfilled' && categoryRes.value.length) {
    sections.push(section('Sales by Category', undefined, chartTable(
      'Category',
      categoryRes.value.map((p) => ({ name: p.name, value: Number(p.value) })),
    )))
  }

  if (includeCharts(options) && paymentRes.status === 'fulfilled' && paymentRes.value.length) {
    sections.push(section('Payment Methods', undefined, chartTable(
      'Payment',
      paymentRes.value.map((p) => ({ name: p.name, value: Number(p.value) })),
    )))
  }

  if (includeRaw(options) && topRes.status === 'fulfilled' && topRes.value.length) {
    sections.push(section('Top Products', undefined, {
      title: 'Top Products',
      headers: ['Product', 'Category', 'Units', 'Revenue'],
      rows: topRes.value.map((row, i) => [
        String(row.productName ?? row.name ?? `Product ${i + 1}`),
        String(row.category ?? ''),
        Number(row.unitsSold ?? row.units ?? 0),
        formatRWF(Number(row.revenue ?? row.totalRevenue ?? 0)),
      ]),
    }))
  }

  if (includeCharts(options) && heatmapRes.status === 'fulfilled' && heatmapRes.value.length) {
    const topHeat = [...heatmapRes.value].sort((a, b) => b.value - a.value).slice(0, 15)
    sections.push(section('Peak Sales Times (Top 15)', undefined, {
      title: 'Heatmap',
      headers: ['Day', 'Hour', 'Transactions'],
      rows: topHeat.map((h) => [h.day, h.hour, h.value]),
    }))
  }

  return { title: 'Sales Summary Report', subtitle: 'Live data from RetailPulse sales APIs', sections }
}

export async function fetchCustomerExportData(options: ExportOptions): Promise<ExportData> {
  const [summaryRes, segmentsRes, topRes, churnRes, freqRes, ltvRes] = await Promise.allSettled([
    customerApi.getSummary(),
    customerApi.getSegments(),
    customerApi.getTop(25),
    customerApi.getChurnRisks(),
    customerApi.getFrequency(),
    customerApi.getLtvTrend(),
  ])

  const sections: ExportSection[] = []
  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null

  if (includeSummary(options) && summary) {
    sections.push(section('Customer Summary', [
      `Total customers: ${summary.totalCustomers}`,
      `Loyalty members: ${summary.loyaltyMembers}`,
      `Average LTV: ${formatRWF(summary.avgLifetimeValue)}`,
      `High churn risk: ${summary.highChurnRisk}`,
    ]))
  }

  if (includeCharts(options) && segmentsRes.status === 'fulfilled' && segmentsRes.value.length) {
    sections.push(section('RFM Segments', undefined, chartTable(
      'Segments',
      segmentsRes.value.map((p) => ({ name: p.name, value: Number(p.value) })),
    )))
  }

  if (includeCharts(options) && freqRes.status === 'fulfilled' && freqRes.value.length) {
    sections.push(section('Purchase Frequency', undefined, chartTable('Frequency', freqRes.value)))
  }

  if (includeCharts(options) && ltvRes.status === 'fulfilled' && ltvRes.value.length) {
    sections.push(section('LTV Trend', undefined, {
      title: 'LTV',
      headers: ['Month', 'Avg LTV (RWF)'],
      rows: ltvRes.value.map((p) => [p.name, formatRWF(p.ltv)]),
    }))
  }

  if (includeRaw(options) && topRes.status === 'fulfilled' && topRes.value.length) {
    sections.push(section('Top Customers', undefined, {
      title: 'Customers',
      headers: ['Name', 'Type', 'LTV', 'RFM Segment', 'Churn Risk'],
      rows: topRes.value.map((c) => [
        c.customerName,
        c.customerType,
        formatRWF(Number(c.lifetimeValue)),
        c.rfmSegment ?? '',
        c.churnRiskScore != null ? `${Math.round(Number(c.churnRiskScore) * 100)}%` : '',
      ]),
    }))
  }

  if (includeAi(options) && churnRes.status === 'fulfilled' && churnRes.value.length) {
    sections.push(section('Churn Risk Customers', undefined, {
      title: 'Churn',
      headers: ['Name', 'LTV', 'Churn Risk', 'Segment'],
      rows: churnRes.value.map((c) => [
        c.customerName,
        formatRWF(Number(c.lifetimeValue)),
        c.churnRiskScore != null ? `${Math.round(Number(c.churnRiskScore) * 100)}%` : '',
        c.rfmSegment ?? '',
      ]),
    }))
  }

  return { title: 'Customer Analytics Report', subtitle: 'Live data from RetailPulse customer APIs', sections }
}

export async function fetchForecastExportData(options: ExportOptions): Promise<ExportData> {
  const [weeklyRes, monthlyRes, accuracyRes] = await Promise.allSettled([
    forecastApi.generateDemandForecast('weekly'),
    forecastApi.generateDemandForecast('monthly'),
    forecastApi.getAccuracy(),
  ])

  const sections: ExportSection[] = []

  if (includeAi(options) && accuracyRes.status === 'fulfilled') {
    const a = accuracyRes.value
    sections.push(section('Model Accuracy', [
      `Overall accuracy: ${a.overall.toFixed(1)}%`,
      `7-day precision: ${a.weeklyPrecision.toFixed(1)}%`,
      `MAPE: ${Number(a.mape).toFixed(2)}%`,
      `AI service: ${a.aiPowered ? 'Connected' : 'Offline'}`,
    ]))
  }

  if (includeCharts(options) && weeklyRes.status === 'fulfilled' && weeklyRes.value.chart.length) {
    sections.push(section('Weekly Demand Forecast', undefined, {
      title: 'Weekly',
      headers: ['Date', 'Actual', 'Predicted', 'Lower', 'Upper'],
      rows: weeklyRes.value.chart.slice(0, 14).map((p) => [
        p.date,
        p.actual != null ? String(p.actual) : '',
        p.predicted != null ? String(p.predicted) : '',
        p.lower != null ? String(p.lower) : '',
        p.upper != null ? String(p.upper) : '',
      ]),
    }))
  }

  if (includeCharts(options) && monthlyRes.status === 'fulfilled' && monthlyRes.value.chart.length) {
    sections.push(section('Monthly Demand Forecast', undefined, {
      title: 'Monthly',
      headers: ['Date', 'Actual', 'Predicted', 'Lower', 'Upper'],
      rows: monthlyRes.value.chart.slice(0, 30).map((p) => [
        p.date,
        p.actual != null ? String(p.actual) : '',
        p.predicted != null ? String(p.predicted) : '',
        p.lower != null ? String(p.lower) : '',
        p.upper != null ? String(p.upper) : '',
      ]),
    }))
  }

  return { title: 'Demand Forecast Report', subtitle: 'Live data from RetailPulse forecast APIs', sections }
}

export async function fetchProductsExportData(options: ExportOptions): Promise<ExportData> {
  const products = await productApi.getAll()
  const sections: ExportSection[] = []

  if (includeSummary(options)) {
    const active = products.filter((p) => p.isActive).length
    const low = products.filter((p) => p.status === 'low' || p.status === 'critical').length
    sections.push(section('Catalog Summary', [
      `Total products: ${products.length}`,
      `Active: ${active}`,
      `Low or critical stock: ${low}`,
    ]))
  }

  if (includeRaw(options) && products.length) {
    sections.push(section('Product Catalog', undefined, {
      title: 'Products',
      headers: ['Name', 'SKU', 'Category', 'Stock', 'Reorder', 'Cost', 'Price', 'Status'],
      rows: products.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.stock,
        p.reorderPoint,
        formatRWF(p.costPrice),
        formatRWF(p.sellingPrice),
        p.status,
      ]),
    }))
  }

  return { title: 'Product Catalog Export', subtitle: 'Live data from RetailPulse product API', sections }
}

export async function fetchPlanningExportData(options: ExportOptions): Promise<ExportData> {
  return fetchDashboardExportData(options)
}

export async function fetchRecommendationsExportData(options: ExportOptions): Promise<ExportData> {
  const seasonalRes = await recommendationApi.getSeasonal()
  const sections: ExportSection[] = []

  if (includeSummary(options)) {
    sections.push(section('Seasonal Recommendations', [
      `Seasons covered: ${new Set(seasonalRes.map((r) => String(r.season ?? ''))).size}`,
      `Total suggestions: ${seasonalRes.length}`,
    ]))
  }

  if (seasonalRes.length) {
    sections.push(section('Seasonal Product Suggestions', undefined, {
      title: 'Seasonal',
      headers: ['Season', 'Product', 'Confidence'],
      rows: seasonalRes.map((r) => [
        String(r.season ?? ''),
        String(r.recommendedProduct ?? r.sourceProduct ?? ''),
        r.confidenceScore != null ? `${Math.round(Number(r.confidenceScore) * (Number(r.confidenceScore) <= 1 ? 100 : 1))}%` : '',
      ]),
    }))
  }

  return { title: 'Product Recommendations Report', subtitle: 'Seasonal demand-based recommendations', sections }
}

export async function fetchStoreComparisonExportData(options: ExportOptions): Promise<ExportData> {
  return fetchDashboardExportData(options)
}

export async function fetchDashboardExportData(options: ExportOptions): Promise<ExportData> {
  const [summaryRes, txRes, alertsRes] = await Promise.allSettled([
    dashboardApi.getSummary(),
    dashboardApi.getRecentTransactions(),
    dashboardApi.getRecentAlerts(),
  ])

  const sections: ExportSection[] = []

  if (includeSummary(options) && summaryRes.status === 'fulfilled') {
    sections.push(section('Dashboard KPIs', summaryRes.value.kpis.map((k) => `${k.label}: ${k.value} (${k.trendLabel})`)))
  }

  if (includeRaw(options) && txRes.status === 'fulfilled' && txRes.value.length) {
    sections.push(section('Recent Transactions', undefined, {
      title: 'Transactions',
      headers: ['ID', 'Amount', 'Payment', 'Date'],
      rows: txRes.value.slice(0, 25).map((t) => [
        t.transactionId,
        formatRWF(Number(t.totalAmount)),
        t.paymentMethod,
        t.transactionDate,
      ]),
    }))
  }

  if (includeAi(options) && alertsRes.status === 'fulfilled' && alertsRes.value.length) {
    sections.push(section('Recent Alerts', undefined, {
      title: 'Alerts',
      headers: ['Type', 'Severity', 'Message', 'Date'],
      rows: alertsRes.value.slice(0, 15).map((a) => [a.alertType, a.severity, a.message, a.createdAt]),
    }))
  }

  return { title: 'Dashboard Report', subtitle: 'Live data from RetailPulse dashboard APIs', sections }
}

export async function fetchReportExportData(reportType: string, options: ExportOptions): Promise<ExportData> {
  const normalized = reportType.replace(/^Download\s+/i, '').trim().toLowerCase()

  switch (normalized) {
    case 'inventory-status':
      return fetchInventoryExportData(options)
    case 'sales-summary':
      return fetchSalesExportData(options)
    case 'customer-analytics':
    case 'customer-insights':
      return fetchCustomerExportData(options)
    case 'forecast-report':
      return fetchForecastExportData(options)
    case 'store-comparison':
    case 'financial-overview':
      return fetchDashboardExportData(options)
    case 'custom':
      return fetchDashboardExportData(options)
    default:
      if (normalized.includes('inventory')) return fetchInventoryExportData(options)
      if (normalized.includes('sales')) return fetchSalesExportData(options)
      if (normalized.includes('customer')) return fetchCustomerExportData(options)
      if (normalized.includes('forecast')) return fetchForecastExportData(options)
      return fetchDashboardExportData(options)
  }
}
