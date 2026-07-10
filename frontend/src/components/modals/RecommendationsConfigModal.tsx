import { useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { Switch } from '../ui/Switch'
import { useToast } from '../../contexts/ToastContext'
import { saveSeasonalConfig, type SeasonalConfig } from '../../types/seasonalConfig'

interface RecommendationsConfigModalProps {
  open: boolean
  onClose: () => void
  onSave: (cfg: SeasonalConfig) => void
  initialConfig: SeasonalConfig
}

// NOTE: non-component exports (SeasonalConfig, DEFAULT_CONFIG, loadSeasonalConfig)
// live in ../../types/seasonalConfig so this file only exports a component (Fast Refresh).
export function RecommendationsConfigModal({
  open,
  onClose,
  onSave,
  initialConfig,
}: RecommendationsConfigModalProps) {
  const { toast } = useToast()
  // initialConfig is passed fresh each time the modal mounts via `key` in the parent,
  // so we never need a useEffect to sync it.
  const [config, setConfig] = useState<SeasonalConfig>(initialConfig)

  const setCfg = (patch: Partial<SeasonalConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    saveSeasonalConfig(config)
    onSave(config)
    toast('Seasonal recommendation settings saved', 'success')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Configure Seasonal Recommendations"
      maxWidth="max-w-lg"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light">
            Save Configuration
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-on-glass-muted">
          Adjust seasonal demand-based product suggestion settings for Spring, Summer, Autumn, and Winter.
        </p>

        <label className="flex items-center justify-between" htmlFor="rec-enabled">
          <span className="text-sm text-on-glass">Enable seasonal recommendations</span>
          <Switch checked={config.enabled} onChange={(v) => setCfg({ enabled: v })} />
        </label>

        <div>
          <label className="mb-1 block text-sm text-on-glass-muted" htmlFor="rec-min-confidence">
            Min Confidence (%)
          </label>
          <input
            id="rec-min-confidence"
            type="range"
            min={50}
            max={95}
            value={config.minConfidence}
            title={`Minimum confidence: ${config.minConfidence}%`}
            onChange={(e) => setCfg({ minConfidence: Number(e.target.value) })}
            className="w-full accent-copper"
          />
          <p className="mt-1 text-xs text-copper-light">{config.minConfidence}%</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-on-glass-muted" htmlFor="rec-max-products">
            Max Products per Season
          </label>
          <input
            id="rec-max-products"
            type="number"
            min={3}
            max={15}
            value={config.maxProducts}
            title="Maximum number of products to display per season"
            onChange={(e) => setCfg({ maxProducts: Number(e.target.value) })}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-on-glass-muted" htmlFor="rec-display-days">
            Display Duration (days)
          </label>
          <input
            id="rec-display-days"
            type="number"
            min={7}
            max={90}
            value={config.displayDays}
            title="Number of days the seasonal window covers"
            onChange={(e) => setCfg({ displayDays: Number(e.target.value) })}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <label className="flex items-center justify-between" htmlFor="rec-auto-refresh">
            <span className="text-sm text-on-glass">Auto-refresh with new sales data</span>
            <Switch checked={config.autoRefresh} onChange={(v) => setCfg({ autoRefresh: v })} />
          </label>
          <p className="mt-1 text-xs text-on-glass-muted">
            Automatically reloads recommendations when configuration is saved.
          </p>
        </div>
      </div>
    </Dialog>
  )
}
