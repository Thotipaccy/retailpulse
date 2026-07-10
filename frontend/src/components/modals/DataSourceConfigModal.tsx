import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../../contexts/ToastContext'
import { dataApi } from '../../services/dataApi'

export interface DataSourceConfig {
  id: string
  name: string
  type: string
  status: 'connected' | 'syncing' | 'error'
  health: number
  connectionString?: string
  syncFrequency?: string
  fieldMappings?: { source: string; target: string }[]
}

interface DataSourceConfigModalProps {
  open: boolean
  onClose: () => void
  source: DataSourceConfig | null
  onSave: (config: DataSourceConfig) => void
}

const DEFAULT_MAPPINGS = [
  { source: 'product_id', target: 'sku_code' },
  { source: 'qty_on_hand', target: 'quantity_on_hand' },
  { source: 'unit_price', target: 'unit_price' },
]

export function DataSourceConfigModal({ open, onClose, source, onSave }: DataSourceConfigModalProps) {
  const { toast } = useToast()
  const [connectionString, setConnectionString] = useState('')
  const [syncFrequency, setSyncFrequency] = useState('Every hour')
  const [mappings, setMappings] = useState(DEFAULT_MAPPINGS)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (open && source) {
      setConnectionString(source.connectionString ?? `https://api.retailpulse.rw/${source.id}`)
      setSyncFrequency(source.syncFrequency ?? 'Every hour')
      setMappings(source.fieldMappings ?? DEFAULT_MAPPINGS)
      setTestResult('idle')
    }
  }, [open, source])

  const handleTest = async () => {
    if (!source) return
    setTesting(true)
    setTestResult('idle')
    try {
      const result = await dataApi.testConnection(source.id)
      setTestResult(result.success ? 'success' : 'error')
      const latencyMsg = result.latency != null ? ` (${result.latency}ms)` : ''
      toast(result.message + latencyMsg, result.success ? 'success' : 'error')
    } catch {
      setTestResult('error')
      toast('Connection test failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!source) return
    onSave({
      ...source,
      connectionString,
      syncFrequency,
      fieldMappings: mappings,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Configure ${source?.name ?? 'Source'}`}
      maxWidth="max-w-lg"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light">
            Save
          </button>
        </>
      )}
    >
      {source && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
            {source.status === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-rust-light" />
            ) : source.status === 'syncing' ? (
              <RefreshCw className="h-5 w-5 animate-spin text-ochre" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-forest-light" />
            )}
            <div>
              <p className="text-sm font-medium text-on-glass">{source.name}</p>
              <p className="text-xs text-on-glass-muted">{source.type} · Health {source.health}%</p>
            </div>
          </div>

          <div>
            <label className="text-sm text-on-glass-muted">Connection String / Source URL</label>
            <input
              type="text"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-sm text-on-glass-muted">Sync Frequency</label>
            <select value={syncFrequency} onChange={(e) => setSyncFrequency(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
              <option>Every 15 minutes</option>
              <option>Every hour</option>
              <option>Every 4 hours</option>
              <option>Daily</option>
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-on-glass">Field Mapping</p>
            <div className="space-y-2">
              {mappings.map((m, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={m.source}
                    onChange={(e) => setMappings((prev) => prev.map((x, j) => j === i ? { ...x, source: e.target.value } : x))}
                    className="glass-input rounded-lg px-3 py-1.5 text-xs font-mono"
                    placeholder="Source field"
                  />
                  <input
                    type="text"
                    value={m.target}
                    onChange={(e) => setMappings((prev) => prev.map((x, j) => j === i ? { ...x, target: e.target.value } : x))}
                    className="glass-input rounded-lg px-3 py-1.5 text-xs font-mono"
                    placeholder="Target field"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-copper/40 bg-copper/10 px-4 py-2.5 text-sm font-medium text-copper-light hover:bg-copper/20 disabled:opacity-60"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {testing ? 'Testing Connection...' : 'Test Connection'}
          </button>
          {testResult === 'success' && (
            <p className="text-center text-sm text-forest-light">Connection verified successfully</p>
          )}
          {testResult === 'error' && (
            <p className="text-center text-sm text-rust-light">Connection failed — verify credentials</p>
          )}
        </div>
      )}
    </Dialog>
  )
}
