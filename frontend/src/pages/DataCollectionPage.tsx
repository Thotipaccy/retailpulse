import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Edit2,
  Plus,
  RefreshCw,
  Server,
  Upload,
} from 'lucide-react'
import {
  dataApi,
  type DataQualityMetrics,
  type DataSource,
  type ScheduledImport,
} from '../services/dataApi'
import { notifyDashboardRefresh } from '../utils/dashboardRefresh'
import { getErrorMessage } from '../services/api'
import { formatDateTime, formatRelativeTime } from '../utils/format'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { CircularGauge } from '../components/ui/CircularGauge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { DeleteConfirmModal } from '../components/ui/DeleteConfirmModal'
import { DataSourceConfigModal, type DataSourceConfig } from '../components/modals/DataSourceConfigModal'
import { CreateScheduleImportModal } from '../components/modals/CreateScheduleImportModal'
import { EditScheduleImportModal } from '../components/modals/EditScheduleImportModal'
import { useToast } from '../contexts/ToastContext'

const ACCEPTED_TYPES = '.csv,.xlsx,.xls,.json,.pdf,.txt,.xml'
const ACCEPTED_MIME = ['text/csv', 'application/json', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'text/plain', 'application/xml', 'text/xml']

function parseHealthPercent(health: string): number {
  const n = parseInt(health.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'connected') return 'success'
  if (status === 'syncing') return 'warning'
  if (status === 'error') return 'danger'
  return 'neutral'
}

function statusLabel(status: string): string {
  if (status === 'connected') return 'Connected'
  if (status === 'syncing') return 'Syncing'
  if (status === 'error') return 'Error'
  return status
}

function sourceIcon(type: string) {
  return type === 'POS' || type === 'API' ? Server : Database
}

function toConfig(source: DataSource): DataSourceConfig {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    status: source.status as DataSourceConfig['status'],
    health: parseHealthPercent(source.health),
    connectionString: source.connectionString,
    syncFrequency: source.syncFrequency,
  }
}

async function previewFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.json')) {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      const headers = Object.keys(parsed[0] as Record<string, unknown>)
      const rows = parsed.slice(0, 5).map((row) =>
        headers.map((h) => String((row as Record<string, unknown>)[h] ?? '')),
      )
      return { headers, rows }
    }
    return { headers: ['data'], rows: [[text.slice(0, 80)]] }
  }
  if (name.endsWith('.csv')) {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim())
    const rows = lines.slice(1, 6).map((line) => line.split(',').map((c) => c.trim()))
    return { headers, rows }
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return {
      headers: ['Note'],
      rows: [['Excel preview is limited — row data will be parsed on import. Click Import to proceed.']],
    }
  }
  return {
    headers: ['File', 'Type', 'Size'],
    rows: [[file.name, file.type || 'spreadsheet', `${(file.size / 1024).toFixed(1)} KB`]],
  }
}

export function DataCollectionPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<DataSource[]>([])
  const [imports, setImports] = useState<ScheduledImport[]>([])
  const [quality, setQuality] = useState<DataQualityMetrics>({ completeness: 94, accuracy: 97, consistency: 89, timeliness: 92 })

  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importMessage, setImportMessage] = useState('')

  const [configSource, setConfigSource] = useState<DataSourceConfig | null>(null)
  const [deactivateSource, setDeactivateSource] = useState<DataSource | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editScheduleJob, setEditScheduleJob] = useState<ScheduledImport | null>(null)
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<ScheduledImport | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.allSettled([
      dataApi.getSources(),
      dataApi.getScheduledImports(),
      dataApi.getQualityMetrics(),
    ])
      .then(([sourcesRes, importsRes, qualityRes]) => {
        const failed = [sourcesRes, importsRes, qualityRes].filter((r) => r.status === 'rejected')
        if (failed.length === 3) {
          setError(getErrorMessage((failed[0] as PromiseRejectedResult).reason))
          return
        }
        if (sourcesRes.status === 'fulfilled') setSources(sourcesRes.value)
        if (importsRes.status === 'fulfilled') setImports(importsRes.value)
        if (qualityRes.status === 'fulfilled') setQuality(qualityRes.value)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  const connectedCount = sources.filter((s) => s.status === 'connected').length
  const syncingCount = sources.filter((s) => s.status === 'syncing').length
  const errorCount = sources.filter((s) => s.status === 'error').length

  const handleFileSelect = async (file: File) => {
    const ext = file.name.toLowerCase()
    const valid = ext.endsWith('.csv') || ext.endsWith('.json') || ext.endsWith('.xlsx') || ext.endsWith('.xls')
      || ACCEPTED_MIME.includes(file.type)
    if (!valid) {
      toast('Unsupported file type. Use .csv, .xlsx, .xls, or .json', 'error')
      return
    }
    setSelectedFile(file)
    try {
      setPreview(await previewFile(file))
    } catch {
      setPreview({ headers: ['preview'], rows: [['Unable to parse preview']] })
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return
    setUploading(true)
    setImportProgress(0)
    setImportMessage('Starting import...')
    try {
      const result = await dataApi.uploadFile(selectedFile, (status) => {
        const total = status.totalRecords || 0
        const processed = status.processedRecords || 0
        const pct = total > 0 ? Math.round((processed / total) * 100) : status.status === 'RUNNING' ? 10 : 0
        setImportProgress(Math.min(Math.max(pct, status.status === 'COMPLETED' ? 100 : 5), 100))
        setImportMessage(status.message || `Processing batch ${status.currentBatch} of ${status.totalBatches}...`)
      })
      setImportProgress(100)
      
      const rejectedCount = result.rejectedRows?.length || 0;
      toast(
        `Imported ${result.transactions.toLocaleString()} transactions. Skipped ${result.duplicatesSkipped.toLocaleString()} duplicates.` + 
        (rejectedCount > 0 ? ` Rejected ${rejectedCount} rows.` : ''),
        rejectedCount > 0 ? 'error' : 'success',
      )

      if (rejectedCount > 0) {
        const reportContent = JSON.stringify(result.rejectedRows, null, 2);
        const blob = new Blob([reportContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rejection_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      notifyDashboardRefresh()
      setSelectedFile(null)
      setPreview(null)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setUploading(false)
      setImportProgress(0)
      setImportMessage('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveConfig = async (config: DataSourceConfig) => {
    try {
      await dataApi.updateSource(config.id, {
        connectionString: config.connectionString,
        syncFrequency: config.syncFrequency,
      })
      toast(`${config.name} configuration saved`, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const handleToggleSource = async (source: DataSource, active: boolean) => {
    try {
      await dataApi.toggleSource(source.id, active)
      toast(`${source.name} ${active ? 'reactivated' : 'deactivated'}`, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const handleCreateSchedule = async (payload: { name: string; sourceName: string; frequency: string }) => {
    try {
      await dataApi.createScheduledImport(payload)
      toast(`Schedule "${payload.name}" created`, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const handleUpdateSchedule = async (id: string, payload: { name: string; sourceName: string; frequency: string }) => {
    try {
      await dataApi.updateScheduledImport(id, payload)
      toast(`Schedule updated`, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    try {
      await dataApi.deleteScheduledImport(id)
      toast(`Schedule permanently deleted`, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6 pb-8">
      <ModulePageHeader
        icon={Database}
        title="Data Collection"
        subtitle="Connect, sync, and validate retail data feeds"
        actions={(
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass hover:glass">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        )}
      />

      {/* 1. Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TintedKPICard label="Connected Sources" value={connectedCount} tint="forest" trend={<p className="mt-1 text-xs text-forest-light">All systems operational</p>} />
        <TintedKPICard label="Syncing" value={syncingCount} tint="ochre" trend={<p className="mt-1 text-xs text-ochre">In progress</p>} />
        <TintedKPICard label="Errors" value={errorCount} tint="red" trend={<p className="mt-1 text-xs text-rust-light">Requires attention</p>} />
      </div>

      {/* 2. Connected data sources */}
      <GlassCard className="p-5">
        <h3 className="text-lg font-semibold text-on-glass">Connected Data Sources</h3>
        <p className="mt-1 text-sm text-on-glass-muted">Live integrations feeding RetailPulse analytics</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {sources.map((source) => {
            const Icon = sourceIcon(source.type)
            const healthPct = parseHealthPercent(source.health)
            const inactive = !source.isActive
            return (
              <div
                key={source.id}
                className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between ${
                  inactive ? 'border-white/10 bg-white/5 opacity-80' : 'border-white/15 bg-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper/15">
                      <Icon className="h-5 w-5 text-copper-light" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-glass">{source.name}</p>
                        <StatusBadge variant="info">{source.type}</StatusBadge>
                        <StatusBadge variant={statusVariant(source.status)}>{statusLabel(source.status)}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-on-glass-muted">
                        Last sync: {source.lastSync ? formatRelativeTime(source.lastSync) : '—'}
                        {' · '}
                        {source.recordCount.toLocaleString()} records
                      </p>
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-on-glass-muted">
                          <span>Health</span>
                          <span>{healthPct}%</span>
                        </div>
                        <ProgressBar value={healthPct} color={source.status === 'error' ? '#C45C4A' : '#B87333'} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                  <button
                    type="button"
                    onClick={() => setConfigSource(toConfig(source))}
                    className="rounded-lg border border-copper/30 bg-copper/10 px-3 py-2 text-xs font-medium text-copper-light hover:bg-copper/20"
                  >
                    Edit
                  </button>
                  {source.isActive ? (
                    <button
                      type="button"
                      onClick={() => setDeactivateSource(source)}
                      className="rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-xs font-medium text-rust-light hover:bg-rust/20"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleToggleSource(source, true)}
                      className="rounded-lg border border-forest/30 bg-forest/10 px-3 py-2 text-xs font-medium text-forest-light hover:bg-forest/20"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* 3. Data quality metrics */}
      <GlassCard className="p-5">
        <h3 className="text-lg font-semibold text-on-glass">Data Quality Metrics</h3>
        <p className="mt-1 text-sm text-on-glass-muted">Automated validation across all connected sources</p>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <CircularGauge value={quality.completeness} label="Completeness" color="#4A7C59" />
          <CircularGauge value={quality.accuracy} label="Accuracy" color="#B87333" />
          <CircularGauge value={quality.consistency} label="Consistency" color="#8B7355" />
          <CircularGauge value={quality.timeliness} label="Timeliness" color="#5C7A8A" />
        </div>
      </GlassCard>

      {/* 4. Manual data import */}
      <GlassCard className="p-5">
        <h3 className="text-lg font-semibold text-on-glass">Manual Data Import</h3>
        <p className="mt-1 text-sm text-on-glass-muted">Upload sales, inventory, or customer data files</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void handleFileSelect(file)
          }}
          className={`mt-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-copper bg-copper/10' : 'border-white/20 bg-white/5'
          }`}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-copper-light" />
          <p className="mt-3 text-sm text-on-glass">Drag and drop files here</p>
          <p className="mt-1 text-xs text-on-glass-muted">Accepts .csv, .xlsx, .xls, .json</p>
          <input
            ref={fileInputRef}
            type="file"
            title="Upload data file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFileSelect(file)
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
          >
            <Upload className="h-4 w-4" />
            Select Files
          </button>
        </div>

        {selectedFile && preview && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-on-glass">{selectedFile.name}</p>
              <p className="text-xs text-on-glass-muted">Preview (first 5 rows)</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-on-glass-muted">
                    {preview.headers.map((h) => (
                      <th key={h} className="px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5 text-on-glass">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-2">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {uploading && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-on-glass-muted">
                  <span>{importMessage || 'Importing...'}</span>
                  <span>{importProgress}%</span>
                </div>
                <ProgressBar value={importProgress} />
              </div>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleImport()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {uploading ? 'Importing...' : 'Import Data'}
            </button>
          </div>
        )}
      </GlassCard>

      {/* 5. Scheduled imports */}
      <GlassCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-on-glass">Scheduled Imports</h3>
            <p className="text-sm text-on-glass-muted">Automated data ingestion jobs</p>
          </div>
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
          >
            <Plus className="h-4 w-4" />
            Create Schedule
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-on-glass-muted">
                <th className="px-6 py-3 font-medium">Import Name</th>
                <th className="px-4 py-3 font-medium">Frequency</th>
                <th className="px-4 py-3 font-medium">Last Run</th>
                <th className="px-4 py-3 font-medium">Records</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((job) => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-6 py-3.5 font-medium text-on-glass">{job.name}</td>
                  <td className="px-4 py-3.5 text-on-glass-muted">{job.frequency}</td>
                  <td className="px-4 py-3.5 text-on-glass-muted">
                    {job.lastRun ? formatDateTime(job.lastRun) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-on-glass-muted">{job.recordsImported.toLocaleString()}</td>
                  <td className="px-6 py-3.5">
                    <StatusBadge
                      variant={job.status === 'active' ? 'success' : job.status === 'paused' ? 'warning' : 'neutral'}
                    >
                      {job.status}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button type="button" onClick={() => setEditScheduleJob(job)} className="p-1.5 text-on-glass-muted hover:text-white" title="Edit Schedule">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteScheduleTarget(job)} className="p-1.5 text-on-glass-muted hover:text-danger" title="Delete Schedule">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* 6. Config modal */}
      <DataSourceConfigModal
        open={!!configSource}
        onClose={() => setConfigSource(null)}
        source={configSource}
        onSave={(config) => void handleSaveConfig(config)}
      />

      <CreateScheduleImportModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        sources={sources.filter((s) => s.isActive)}
        onSave={(payload) => void handleCreateSchedule(payload)}
      />

      <EditScheduleImportModal
        open={!!editScheduleJob}
        onClose={() => setEditScheduleJob(null)}
        sources={sources.filter((s) => s.isActive)}
        job={editScheduleJob}
        onSave={(id, payload) => void handleUpdateSchedule(id, payload)}
      />

      <DeactivateConfirmModal
        isOpen={!!deactivateSource}
        itemName={deactivateSource?.name ?? 'this source'}
        onConfirm={() => {
          if (deactivateSource) void handleToggleSource(deactivateSource, false)
          setDeactivateSource(null)
        }}
        onCancel={() => setDeactivateSource(null)}
      />

      <DeleteConfirmModal
        isOpen={!!deleteScheduleTarget}
        itemName={deleteScheduleTarget?.name ?? 'this schedule'}
        onConfirm={() => {
          if (deleteScheduleTarget) void handleDeleteSchedule(deleteScheduleTarget.id)
          setDeleteScheduleTarget(null)
        }}
        onCancel={() => setDeleteScheduleTarget(null)}
      />
    </div>
  )
}
