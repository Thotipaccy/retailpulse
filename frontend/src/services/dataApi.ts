import { api, unwrap } from './api'

export interface DataSource {
  id: string
  name: string
  type: string
  status: string
  lastSync?: string
  health: string
  syncFrequency: string
  connectionString?: string
  isActive: boolean
  recordCount: number
}

export interface DataQualityMetrics {
  completeness: number
  accuracy: number
  consistency: number
  timeliness: number
}

export interface ScheduledImport {
  id: string
  name: string
  sourceName: string
  frequency: string
  lastRun?: string
  recordsImported: number
  nextRun?: string
  status: string
}

export interface CsvUploadResult {
  fileName: string
  rowsImported: number
  recordsImported: number
  duplicatesSkipped: number
  newProducts: number
  newCustomers: number
  transactions: number
  status: string
  importedAt: string
  rejectedRows?: unknown[]
}

export interface ImportJobStatus {
  jobId: string
  status: string
  totalRecords: number
  processedRecords: number
  currentBatch: number
  totalBatches: number
  message: string
  result?: Record<string, unknown>
  error?: string
}

const UPLOAD_TIMEOUT_MS = 300_000
const POLL_INTERVAL_MS = 5_000

function mapSource(raw: Record<string, unknown>): DataSource {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? 'unknown'),
    lastSync: raw.lastSync ? String(raw.lastSync) : undefined,
    health: String(raw.health ?? '—'),
    syncFrequency: String(raw.syncFrequency ?? '—'),
    connectionString: raw.connectionString ? String(raw.connectionString) : undefined,
    isActive: Boolean(raw.isActive ?? true),
    recordCount: Number(raw.recordCount ?? 0),
  }
}

function mapUploadResult(result: Record<string, unknown>, fileName: string): CsvUploadResult {
  return {
    fileName: String(result.fileName ?? fileName),
    rowsImported: Number(result.rowsImported ?? result.recordsImported ?? 0),
    recordsImported: Number(result.recordsImported ?? result.rowsImported ?? 0),
    duplicatesSkipped: Number(result.duplicatesSkipped ?? 0),
    newProducts: Number(result.newProducts ?? 0),
    newCustomers: Number(result.newCustomers ?? 0),
    transactions: Number(result.transactions ?? 0),
    status: String(result.status ?? 'SUCCESS'),
    importedAt: String(result.importedAt ?? new Date().toISOString()),
    rejectedRows: Array.isArray(result.rejectedRows) ? result.rejectedRows : undefined,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function mapImport(raw: Record<string, unknown>): ScheduledImport {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    sourceName: String(raw.sourceName ?? ''),
    frequency: String(raw.frequency ?? ''),
    lastRun: raw.lastRun ? String(raw.lastRun) : undefined,
    recordsImported: Number(raw.recordsImported ?? 0),
    nextRun: raw.nextRun ? String(raw.nextRun) : undefined,
    status: String(raw.status ?? 'unknown'),
  }
}

function mapImportStatus(raw: Record<string, unknown>): ImportJobStatus {
  return {
    jobId: String(raw.jobId ?? ''),
    status: String(raw.status ?? 'UNKNOWN'),
    totalRecords: Number(raw.totalRecords ?? 0),
    processedRecords: Number(raw.processedRecords ?? 0),
    currentBatch: Number(raw.currentBatch ?? 0),
    totalBatches: Number(raw.totalBatches ?? 0),
    message: String(raw.message ?? ''),
    result: raw.result && typeof raw.result === 'object' ? raw.result as Record<string, unknown> : undefined,
    error: raw.error ? String(raw.error) : undefined,
  }
}

export const dataApi = {
  async getSources(): Promise<DataSource[]> {
    const { data } = await api.get('/data/sources')
    const sources = unwrap<Array<Record<string, unknown>>>({ data })
    return sources.map(mapSource)
  },

  async getQualityMetrics(): Promise<DataQualityMetrics> {
    const { data } = await api.get('/data/quality')
    const metrics = unwrap<Record<string, unknown>>({ data })
    return {
      completeness: Number(metrics.completeness ?? 0),
      accuracy: Number(metrics.accuracy ?? 0),
      consistency: Number(metrics.consistency ?? 0),
      timeliness: Number(metrics.timeliness ?? 0),
    }
  },

  async getImportStatus(jobId: string): Promise<ImportJobStatus> {
    const { data } = await api.get(`/data/upload/status/${jobId}`)
    return mapImportStatus(unwrap<Record<string, unknown>>({ data }))
  },

  async uploadFile(file: File, onProgress?: (status: ImportJobStatus) => void): Promise<CsvUploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/data/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
    })
    const started = unwrap<Record<string, unknown>>({ data })
    const jobId = String(started.jobId ?? '')
    if (!jobId) {
      throw new Error('Import did not return a job ID')
    }

    const deadline = Date.now() + UPLOAD_TIMEOUT_MS
    while (Date.now() < deadline) {
      const status = await this.getImportStatus(jobId)
      onProgress?.(status)
      if (status.status === 'COMPLETED' && status.result) {
        return mapUploadResult(status.result, file.name)
      }
      if (status.status === 'FAILED') {
        throw new Error(status.error ?? status.message ?? 'Import failed')
      }
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error('Import timed out after 5 minutes')
  },

  async getScheduledImports(): Promise<ScheduledImport[]> {
    const { data } = await api.get('/data/scheduled-imports')
    const imports = unwrap<Array<Record<string, unknown>>>({ data })
    return imports.map(mapImport)
  },

  async createScheduledImport(payload: { name: string; sourceName: string; frequency: string }): Promise<ScheduledImport> {
    const { data } = await api.post('/data/scheduled-imports', payload)
    const created = unwrap<Record<string, unknown>>({ data })
    return mapImport(created)
  },

  async updateScheduledImport(id: string, payload: { name?: string; sourceName?: string; frequency?: string }): Promise<ScheduledImport> {
    const { data } = await api.put(`/data/scheduled-imports/${id}`, payload)
    const updated = unwrap<Record<string, unknown>>({ data })
    return mapImport(updated)
  },

  async deleteScheduledImport(id: string): Promise<void> {
    await api.delete(`/data/scheduled-imports/${id}`)
  },

  async updateSource(id: string, payload: { connectionString?: string; syncFrequency?: string }): Promise<DataSource> {
    const { data } = await api.put(`/data/sources/${id}`, payload)
    const updated = unwrap<Record<string, unknown>>({ data })
    return mapSource(updated)
  },

  async toggleSource(id: string, active: boolean): Promise<DataSource> {
    const { data } = await api.patch(`/data/sources/${id}/active`, { active })
    const updated = unwrap<Record<string, unknown>>({ data })
    return mapSource(updated)
  },

  async testConnection(id: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const { data } = await api.post(`/data/sources/${id}/test`)
    const result = unwrap<Record<string, unknown>>({ data })
    return {
      success: Boolean(result.success),
      message: String(result.message ?? ''),
      latency: result.latency != null ? Number(result.latency) : undefined,
    }
  },

  async syncSource(id: string): Promise<Record<string, unknown>> {
    const { data } = await api.post(`/data/sources/${id}/sync`)
    return unwrap<Record<string, unknown>>({ data })
  },
}
