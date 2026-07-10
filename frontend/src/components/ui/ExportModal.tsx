import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Image, Loader2, Presentation, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { ProgressBar } from './ProgressBar'
import { useToast } from '../../contexts/ToastContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import type { ExportData } from '../../types/export'
import { captureChartImages } from '../../utils/chartCapture'
import { createExportBlob, downloadBlob, type ExportFormat } from '../../utils/exportFile'

const FORMATS = [
  { id: 'pdf', label: 'PDF', size: '2.4 MB', icon: FileText, recommended: true },
  { id: 'excel', label: 'Excel', size: '5.1 MB', icon: FileSpreadsheet, recommended: true },
  { id: 'csv', label: 'CSV', size: '1.2 MB', icon: FileSpreadsheet, recommended: false },
  { id: 'pptx', label: 'PowerPoint', size: '8.3 MB', icon: Presentation, recommended: false },
  { id: 'png', label: 'PNG', size: '3.5 MB', icon: Image, recommended: false },
]

const OPTIONS = [
  'Include Charts',
  'Include Raw Data',
  'Include Summary',
  'Include AI Recommendations',
  'Compress File',
]

type ExportPhase = 'idle' | 'generating' | 'success'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  fileName?: string
  resolveExportData?: (options: Record<string, boolean>) => Promise<ExportData>
}

export function ExportModal({
  isOpen,
  onClose,
  title = 'Export Report',
  fileName = 'retailpulse-export',
  resolveExportData,
}: ExportModalProps) {
  const { toast } = useToast()
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [options, setOptions] = useState<Record<string, boolean>>({
    'Include Charts': true,
    'Include Raw Data': true,
    'Include Summary': true,
    'Include AI Recommendations': false,
    'Compress File': false,
  })
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [autoDownloaded, setAutoDownloaded] = useState(false)
  const exportDataRef = useRef<ExportData | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setPhase('idle')
      setProgress(0)
      setAutoDownloaded(false)
      exportDataRef.current = null
    }
  }, [isOpen])

  const handleDownload = useCallback(async () => {
    const data = exportDataRef.current
    if (!data) {
      toast('Export data is not ready yet', 'error')
      return
    }
    toast('Downloading...', 'info')
    try {
      const { blob, extension } = await createExportBlob({
        title: data.title,
        fileName,
        format,
        options,
        data,
      })
      downloadBlob(blob, fileName, extension)
      setAutoDownloaded(true)
      onClose()
    } catch {
      toast('Export failed. Please try again.', 'error')
    }
  }, [fileName, format, onClose, options, toast])

  const handleExport = useCallback(async () => {
    setPhase('generating')
    setProgress(0)
    const tick = window.setInterval(() => {
      setProgress((p) => Math.min(p + 10, 90))
    }, 120)

    try {
      const data = resolveExportData
        ? await resolveExportData(options)
        : { title, subtitle: 'No data provider configured', sections: [] }

      if (options['Include Charts']) {
        const charts = await captureChartImages()
        if (charts.length) {
          data.charts = charts
        }
      }

      exportDataRef.current = data
      setProgress(100)
      window.clearInterval(tick)
      setPhase('success')
    } catch {
      window.clearInterval(tick)
      toast('Failed to load report data from the server', 'error')
      setPhase('idle')
      setProgress(0)
    }
  }, [options, resolveExportData, title, toast])

  useEffect(() => {
    if (phase === 'success' && !autoDownloaded) {
      void handleDownload()
    }
  }, [phase, autoDownloaded, handleDownload])

  const handleClose = useCallback(() => {
    if (phase !== 'generating') onClose()
  }, [phase, onClose])

  useEscapeKey(isOpen, handleClose)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm" onClick={phase === 'generating' ? undefined : handleClose} aria-hidden="true" />
      <GlassCard strong className="relative w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-glass">{title}</h2>
          {phase !== 'generating' && (
            <button type="button" onClick={handleClose} className="text-on-glass-muted hover:text-on-glass" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {phase === 'idle' && (
          <>
            <p className="mt-2 text-sm text-on-glass-muted">Select format and options. Data is fetched live from the API.</p>

            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Export format</legend>
              {FORMATS.map((f) => {
                const Icon = f.icon
                return (
                  <label
                    key={f.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-all ${
                      format === f.id ? 'glass-strong ring-1 ring-copper/50' : 'glass-subtle hover:glass'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={f.id}
                      checked={format === f.id}
                      onChange={() => setFormat(f.id as ExportFormat)}
                      className="accent-copper"
                    />
                    <Icon className="h-5 w-5 text-copper-light" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-on-glass">{f.label}</span>
                      <span className="ml-2 text-xs text-on-glass-muted">{f.size}</span>
                    </div>
                    {f.recommended && (
                      <span className="rounded-full bg-copper/20 px-2 py-0.5 text-[10px] font-medium text-copper-light">
                        Recommended
                      </span>
                    )}
                  </label>
                )
              })}
            </fieldset>

            <div className="mt-4 space-y-2">
              {OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-on-glass">
                  <input
                    type="checkbox"
                    checked={options[opt]}
                    onChange={(e) => setOptions((o) => ({ ...o, [opt]: e.target.checked }))}
                    className="rounded border-white/30 accent-copper"
                  />
                  {opt}
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={handleClose} className="rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass hover:glass">
                Cancel
              </button>
              <button type="button" onClick={() => void handleExport()} className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
                Export Report
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-copper-light" />
            <p className="mt-4 font-medium text-on-glass">Fetching live data...</p>
            <p className="mt-1 text-sm text-on-glass-muted">Preparing {format.toUpperCase()} export</p>
            <ProgressBar value={progress} color="#B87333" className="mt-6" />
            <p className="mt-2 text-xs text-on-glass-muted">{Math.min(progress, 100)}%</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-forest-light" />
            <p className="mt-4 font-medium text-on-glass">Export ready</p>
            <p className="mt-1 text-sm text-on-glass-muted">Your {format.toUpperCase()} file has been generated with live data</p>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-copper px-5 py-2.5 text-sm font-medium text-white hover:bg-copper-light"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
