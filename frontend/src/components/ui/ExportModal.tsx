import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Image, Loader2, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { useToast } from '../../contexts/ToastContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import type { ExportData } from '../../types/export'
import { captureChartImages } from '../../utils/chartCapture'
import { createExportBlob, downloadBlob, type ExportFormat } from '../../utils/exportFile'

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string; icon: typeof FileText; recommended?: boolean }> = [
  { id: 'pdf', label: 'PDF', hint: 'Best for sharing & printing', icon: FileText, recommended: true },
  { id: 'excel', label: 'Excel', hint: 'Editable multi-sheet workbook (.xlsx)', icon: FileSpreadsheet, recommended: true },
  { id: 'csv', label: 'CSV', hint: 'Raw rows for BI tools', icon: FileSpreadsheet, recommended: false },
  { id: 'png', label: 'PNG', hint: 'Visual snapshot with charts', icon: Image, recommended: false },
]

const OPTIONS = [
  'Include Charts',
  'Include Raw Data',
  'Include Summary',
  'Include AI Recommendations',
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
  })
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const exportDataRef = useRef<ExportData | null>(null)
  const [prevOpen, setPrevOpen] = useState(isOpen)

  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen)
    if (!isOpen) {
      setPhase('idle')
    }
  }

  const requestClose = useCallback(() => {
    exportDataRef.current = null
    onClose()
  }, [onClose])

  const downloadData = useCallback(async (data: ExportData) => {
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
      requestClose()
    } catch {
      toast('Export failed. Please try again.', 'error')
    }
  }, [fileName, format, options, requestClose, toast])

  const handleExport = useCallback(async () => {
    setPhase('generating')
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
      setPhase('success')
      void downloadData(data)
    } catch {
      toast('Failed to load report data from the server', 'error')
      setPhase('idle')
    }
  }, [options, resolveExportData, title, toast, downloadData])

  const handleClose = useCallback(() => {
    if (phase !== 'generating') requestClose()
  }, [phase, requestClose])

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
                      <span className="ml-2 text-xs text-on-glass-muted">{f.hint}</span>
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
          </div>
        )}

        {phase === 'success' && (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-forest-light" />
            <p className="mt-4 font-medium text-on-glass">Export ready</p>
            <p className="mt-1 text-sm text-on-glass-muted">Your {format.toUpperCase()} file has been generated with live data</p>
            <button
              type="button"
              onClick={() => {
                const data = exportDataRef.current
                if (data) void downloadData(data)
              }}
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
