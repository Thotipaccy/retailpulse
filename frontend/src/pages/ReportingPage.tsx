import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Plus, BarChart3, Package, Users, TrendingUp, Wallet,
  Settings2, Download, Receipt, ShieldCheck,
} from 'lucide-react'
import { reportApi } from '../services/reportApi'
import { dashboardApi } from '../services/dashboardApi'
import { getErrorMessage } from '../services/api'
import { formatDateTime } from '../utils/format'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { TabNav } from '../components/ui/TabNav'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ReportConfigModal } from '../components/modals/ReportConfigModal'
import { DeleteConfirmModal } from '../components/ui/DeleteConfirmModal'
import { useToast } from '../contexts/ToastContext'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import type { ReportTemplate } from '../types/api'
import type { Report } from '../types'

type Tab = 'templates' | 'builder' | 'scheduled' | 'history'

const TEMPLATE_ICONS: Record<string, typeof BarChart3> = {
  'sales-summary': BarChart3,
  'inventory-status': Package,
  'customer-insights': Users,
  'store-comparison': TrendingUp,
  'financial-overview': Wallet,
  'transaction-history': Receipt,
  'audit-trail': ShieldCheck,
}

/** Maps Custom Builder sections to the closest real backend report type. */
const BUILDER_TYPE_MAP: Record<string, string> = {
  sales: 'sales-summary',
  inventory: 'inventory-status',
  customers: 'customer-analytics',
  forecasts: 'forecast-report',
}

interface BuilderFilters {
  startDate: string
  endDate: string
  category: string
}

interface ScheduledReport {
  id: string
  name: string
  reportType: string
  format: string
  frequency: string
  recipients: string
  active: boolean
  nextRun?: string
}

function mapScheduled(raw: Record<string, unknown>): ScheduledReport {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    reportType: String(raw.reportType ?? ''),
    format: String(raw.format ?? 'pdf'),
    frequency: String(raw.frequency ?? 'weekly'),
    recipients: String(raw.recipients ?? ''),
    active: Boolean(raw.active ?? true),
    nextRun: raw.nextRun ? String(raw.nextRun) : undefined,
  }
}

export function ReportingPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('templates')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [history, setHistory] = useState<Report[]>([])
  const [builderSections, setBuilderSections] = useState<Array<{ id: string; label: string; description: string }>>([])
  const [generating, setGenerating] = useState(false)
  const [configureId, setConfigureId] = useState<string | null>(null)
  const [selectedSections, setSelectedSections] = useState<string[]>(['sales'])
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv' | 'pptx'>('pdf')
  const [builderFilters, setBuilderFilters] = useState<BuilderFilters>({ startDate: '', endDate: '', category: '' })
  const [scheduled, setScheduled] = useState<ScheduledReport[]>([])
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    reportType: 'sales-summary',
    format: 'pdf',
    frequency: 'weekly',
    recipients: '',
    startDate: '',
    endDate: '',
    category: '',
  })
  const [historyPage, setHistoryPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduledReport | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.allSettled([reportApi.getTemplates(), reportApi.getHistory(), reportApi.getScheduled(), dashboardApi.getSummary()])
      .then(([tResult, hResult, sResult, summaryResult]) => {
        if (tResult.status === 'fulfilled') setTemplates(tResult.value)
        if (hResult.status === 'fulfilled') setHistory(hResult.value)
        if (sResult.status === 'fulfilled') {
          setScheduled(sResult.value.map((row) => mapScheduled(row)))
        }

        if (summaryResult.status === 'fulfilled') {
          const kpis = summaryResult.value.kpis ?? []
          const findKpi = (id: string) => kpis.find((k) => k.id === id)?.value ?? '—'
          setBuilderSections([
            { id: 'sales', label: 'Sales & Revenue', description: findKpi('revenue') !== '—' ? `${findKpi('revenue')} revenue` : 'Revenue metrics' },
            { id: 'inventory', label: 'Inventory Metrics', description: findKpi('inventory') !== '—' ? `${findKpi('inventory')} products tracked` : 'Stock levels and turnover' },
            { id: 'customers', label: 'Customer Analytics', description: findKpi('customers') !== '—' ? `${findKpi('customers')} customers` : 'Customer segmentation' },
            { id: 'forecasts', label: 'AI Forecasts', description: 'Demand predictions' },
          ])
        } else {
          setBuilderSections([
            { id: 'sales', label: 'Sales & Revenue', description: 'Revenue metrics' },
            { id: 'inventory', label: 'Inventory Metrics', description: 'Stock levels and turnover' },
            { id: 'customers', label: 'Customer Analytics', description: 'Customer segmentation' },
            { id: 'forecasts', label: 'AI Forecasts', description: 'Demand predictions' },
          ])
        }

        const failed = [tResult, hResult].filter((r) => r.status === 'rejected')
        if (failed.length === 2) {
          setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => { void load() })
  }, [load])

  const configureTemplate = templates.find((t) => t.id === configureId)

  const handleDownloadReport = async (reportId: string) => {
    toast('Downloading report...', 'info')
    try {
      await reportApi.downloadFile(reportId)
    } catch {
      toast('Failed to download report', 'error')
    }
  }

  const handleConfigureSave = async (config: { name: string; frequency: string; format: string; recipients: string }) => {
    if (!configureId) return
    try {
      await reportApi.createSchedule({
        name: config.name,
        reportType: configureId,
        format: config.format.toLowerCase(),
        frequency: config.frequency.toLowerCase(),
        recipients: config.recipients,
      })
      toast('Report scheduled successfully', 'success')
      setConfigureId(null)
      load()
    } catch {
      toast('Failed to schedule report', 'error')
    }
  }

  const handleGenerate = async (
    templateId: string,
    fmt = 'pdf',
    filters?: { startDate?: string; endDate?: string; category?: string },
  ) => {
    setGenerating(true)
    try {
      const params: Record<string, string> = { reportType: templateId, format: fmt }
      if (filters?.startDate) params.startDate = filters.startDate
      if (filters?.endDate) params.endDate = filters.endDate
      if (filters?.category) params.category = filters.category
      await reportApi.generate(params)
      toast('Report generation started', 'success')
      await load()
      toast('Report ready — open Report History to download', 'info')
    } catch (err) {
      toast(getErrorMessage(err) || 'Failed to generate report', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const builderReportType = () => {
    for (const id of ['sales', 'inventory', 'customers', 'forecasts']) {
      if (selectedSections.includes(id)) return BUILDER_TYPE_MAP[id]
    }
    return 'dashboard-summary'
  }

  const handleBuilderGenerate = async () => {
    await handleGenerate(builderReportType(), format, {
      startDate: builderFilters.startDate || undefined,
      endDate: builderFilters.endDate || undefined,
      category: builderFilters.category || undefined,
    })
  }

  const toggleSection = (id: string) => {
    setSelectedSections((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  const handleCreateSchedule = async () => {
    if (!scheduleForm.name.trim() || !scheduleForm.recipients.trim()) {
      toast('Name and recipients are required', 'error')
      return
    }
    try {
      const payload: Record<string, string> = {
        name: scheduleForm.name,
        reportType: scheduleForm.reportType,
        format: scheduleForm.format,
        frequency: scheduleForm.frequency,
        recipients: scheduleForm.recipients,
      }
      if (scheduleForm.startDate) payload.startDate = scheduleForm.startDate
      if (scheduleForm.endDate) payload.endDate = scheduleForm.endDate
      if (scheduleForm.category) payload.category = scheduleForm.category
      await reportApi.createSchedule(payload)
      toast('Report scheduled successfully', 'success')
      setScheduleForm({ name: '', reportType: 'sales-summary', format: 'pdf', frequency: 'weekly', recipients: '', startDate: '', endDate: '', category: '' })
      load()
    } catch {
      toast('Failed to schedule report', 'error')
    }
  }

  const toggleScheduleActive = async (report: ScheduledReport) => {
    try {
      await reportApi.updateSchedule(report.id, { active: String(!report.active) })
      setScheduled((prev) => prev.map((r) => r.id === report.id ? { ...r, active: !r.active } : r))
      toast(report.active ? 'Schedule paused' : 'Schedule activated', 'success')
    } catch {
      toast('Failed to update schedule', 'error')
    }
  }

  const handleDeleteSchedule = async () => {
    if (!deletingSchedule) return
    try {
      await reportApi.deleteSchedule(deletingSchedule.id)
      setScheduled((prev) => prev.filter((r) => r.id !== deletingSchedule.id))
      toast('Schedule deleted', 'success')
    } catch {
      toast('Failed to delete schedule', 'error')
    } finally {
      setDeletingSchedule(null)
    }
  }

  if (loading) return <LoadingSkeleton rows={5} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div>
      <ModulePageHeader
        icon={FileText}
        title="Reporting"
        subtitle="Generate, schedule, and export analytics reports"
        actions={
          <button type="button" onClick={() => setTab('builder')} className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
            <Plus className="h-4 w-4" />
            Create Custom Report
          </button>
        }
      />

      <TabNav
        tabs={[
          { id: 'templates' as Tab, label: 'Report Templates' },
          { id: 'builder' as Tab, label: 'Custom Builder' },
          { id: 'scheduled' as Tab, label: 'Scheduled Reports' },
          { id: 'history' as Tab, label: 'Report History' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'templates' && (
        templates.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No report templates" description="Report templates are not available from the backend." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] ?? BarChart3
              return (
                <GlassCard key={t.id} hover className="flex flex-col p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-copper/15">
                    <Icon className="h-5 w-5 text-copper-light" />
                  </div>
                  <h3 className="font-semibold text-on-glass">{t.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-on-glass-muted">{t.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.formats.map((f) => <StatusBadge key={f} variant="neutral">{f.toUpperCase()}</StatusBadge>)}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" disabled={generating} onClick={() => void handleGenerate(t.id)} className="flex-1 rounded-lg bg-copper px-3 py-2 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50">Generate</button>
                    <button type="button" onClick={() => setConfigureId(t.id)} className="inline-flex items-center gap-1.5 rounded-lg glass-subtle px-3 py-2 text-sm text-on-glass hover:glass">
                      <Settings2 className="h-3.5 w-3.5" />
                      Configure
                    </button>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )
      )}

      {tab === 'builder' && (
        <GlassCard className="p-6">
          <h3 className="font-semibold text-on-glass">Custom Report Builder</h3>
          <p className="mt-1 text-sm text-on-glass-muted">Select data sections, optional filters, and output format</p>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-on-glass-muted">Include Sections</p>
            {builderSections.map((section) => (
              <label key={section.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${selectedSections.includes(section.id) ? 'border-copper/40 bg-copper/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                <input type="checkbox" checked={selectedSections.includes(section.id)} onChange={() => toggleSection(section.id)} className="h-4 w-4 rounded accent-copper" />
                <div>
                  <p className="text-sm font-medium text-on-glass">{section.label}</p>
                  <p className="text-xs text-on-glass-muted">{section.description}</p>
                </div>
              </label>
            ))}
            {selectedSections.length > 1 && (
              <p className="text-xs text-on-glass-muted">
                Multiple sections selected — the generated report will focus on{' '}
                <span className="font-medium text-on-glass">
                  {builderSections.find((s) => s.id === selectedSections.find((id) => BUILDER_TYPE_MAP[id]))?.label ?? 'the first selected section'}
                </span>.
              </p>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-on-glass-muted">Filters (optional)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <input
                type="date"
                title="Start date"
                value={builderFilters.startDate}
                onChange={(e) => setBuilderFilters((f) => ({ ...f, startDate: e.target.value }))}
                className="glass-input rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="date"
                title="End date"
                value={builderFilters.endDate}
                min={builderFilters.startDate || undefined}
                onChange={(e) => setBuilderFilters((f) => ({ ...f, endDate: e.target.value }))}
                className="glass-input rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                title="Category"
                placeholder="Category (e.g. Tools)"
                value={builderFilters.category}
                onChange={(e) => setBuilderFilters((f) => ({ ...f, category: e.target.value }))}
                className="glass-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm text-on-glass-muted">Output Format</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['pdf', 'excel', 'csv', 'pptx'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)} className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${format === f ? 'bg-copper text-white' : 'glass-subtle text-on-glass-muted hover:glass'}`}>{f}</button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button type="button" disabled={generating || !selectedSections.length || (!!builderFilters.startDate && !!builderFilters.endDate && builderFilters.startDate > builderFilters.endDate)} onClick={() => void handleBuilderGenerate()} className="rounded-lg bg-copper px-5 py-2.5 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50">Generate Report</button>
            <button type="button" onClick={() => {
              setScheduleForm({
                name: 'Custom Report',
                reportType: builderReportType(),
                format,
                frequency: 'weekly',
                recipients: '',
                startDate: builderFilters.startDate,
                endDate: builderFilters.endDate,
                category: builderFilters.category,
              })
              setTab('scheduled')
            }} className="rounded-lg glass-subtle px-5 py-2.5 text-sm font-medium text-on-glass hover:glass">Schedule This Report</button>
          </div>
        </GlassCard>
      )}

      {tab === 'scheduled' && (
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="font-semibold text-on-glass">Create Scheduled Report</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={scheduleForm.name} onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Schedule name" className="glass-input rounded-lg px-3 py-2 text-sm" />
              <input value={scheduleForm.recipients} onChange={(e) => setScheduleForm((f) => ({ ...f, recipients: e.target.value }))} placeholder="Recipients (comma-separated emails)" className="glass-input rounded-lg px-3 py-2 text-sm sm:col-span-2" />
              <select title="Report Type" value={scheduleForm.reportType} onChange={(e) => setScheduleForm((f) => ({ ...f, reportType: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select title="Frequency" value={scheduleForm.frequency} onChange={(e) => setScheduleForm((f) => ({ ...f, frequency: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select title="Format" value={scheduleForm.format} onChange={(e) => setScheduleForm((f) => ({ ...f, format: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm sm:col-span-2">
                <option value="pdf">PDF</option>
                <option value="excel">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
                <option value="pptx">PowerPoint (.pptx)</option>
              </select>
              <input type="date" title="Start date (optional)" value={scheduleForm.startDate} onChange={(e) => setScheduleForm((f) => ({ ...f, startDate: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" title="End date (optional)" value={scheduleForm.endDate} min={scheduleForm.startDate || undefined} onChange={(e) => setScheduleForm((f) => ({ ...f, endDate: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm" />
                <input type="text" title="Category (optional)" placeholder="Category" value={scheduleForm.category} onChange={(e) => setScheduleForm((f) => ({ ...f, category: e.target.value }))} className="glass-input rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="mt-2 text-xs text-on-glass-muted">Filters apply to every run of this schedule. Leave blank to include all data.</p>
            <button type="button" onClick={() => void handleCreateSchedule()} className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">Add Schedule</button>
          </GlassCard>

          {scheduled.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" />} title="No scheduled reports" description="Create a schedule to receive reports automatically." />
          ) : (
            <GlassCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-on-glass-muted">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Report</th>
                      <th className="px-5 py-3 font-medium">Frequency</th>
                      <th className="px-5 py-3 font-medium">Recipients</th>
                      <th className="px-5 py-3 font-medium">Next Run</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {scheduled.map((r) => (
                      <tr key={r.id} className="text-on-glass">
                        <td className="px-5 py-3 font-medium">{r.name}</td>
                        <td className="px-5 py-3">{r.reportType}</td>
                        <td className="px-5 py-3 capitalize">{r.frequency}</td>
                        <td className="px-5 py-3 text-on-glass-muted">{r.recipients}</td>
                        <td className="px-5 py-3 text-on-glass-muted">{r.nextRun ? formatDateTime(r.nextRun) : '—'}</td>
                        <td className="px-5 py-3">
                          <StatusBadge variant={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Paused'}</StatusBadge>
                        </td>
                        <td className="px-5 py-3 flex gap-3">
                          <button type="button" onClick={() => void toggleScheduleActive(r)} className="text-sm text-copper-light hover:underline">
                            {r.active ? 'Pause' : 'Activate'}
                          </button>
                          <button type="button" onClick={() => setDeletingSchedule(r)} className="text-sm text-red-400 hover:text-red-300 hover:underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {tab === 'history' && (
        history.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No report history" description="No reports have been generated yet." />
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-on-glass-muted">
                    <th className="px-5 py-3 font-medium">Report</th>
                    <th className="px-5 py-3 font-medium">Format</th>
                    <th className="px-5 py-3 font-medium">Filters</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Generated</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.slice((historyPage - 1) * pageSize, historyPage * pageSize).map((r) => (
                    <tr key={r.reportId} className="text-on-glass">
                      <td className="px-5 py-3 font-medium">{r.fileName ?? r.reportType}</td>
                      <td className="px-5 py-3"><StatusBadge variant="neutral">{r.format.toUpperCase()}</StatusBadge></td>
                      <td className="px-5 py-3 max-w-[220px] truncate text-on-glass-muted" title={r.filterSummary}>{r.filterSummary ?? 'All data'}</td>
                      <td className="px-5 py-3">
                        <StatusBadge variant={r.status === 'ready' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.status}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-on-glass-muted">{formatDateTime(r.generatedAt)}</td>
                      <td className="px-5 py-3">
                        {r.status === 'ready' && (
                          <button type="button" onClick={() => void handleDownloadReport(r.reportId)} className="inline-flex items-center gap-1 text-sm text-copper-light hover:underline">
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination 
              currentPage={historyPage} 
              totalItems={history.length} 
              pageSize={pageSize} 
              onPageChange={setHistoryPage} 
              onPageSizeChange={setPageSize} 
              className="mt-2 px-4 pb-4" 
            />
          </GlassCard>
        )
      )}

      <ReportConfigModal open={!!configureId} onClose={() => setConfigureId(null)} templateName={configureTemplate?.name} onSave={handleConfigureSave} />
      <DeleteConfirmModal
        isOpen={!!deletingSchedule}
        onCancel={() => setDeletingSchedule(null)}
        onConfirm={() => void handleDeleteSchedule()}
        itemName={`scheduled report "${deletingSchedule?.name}"`}
      />
    </div>
  )
}
