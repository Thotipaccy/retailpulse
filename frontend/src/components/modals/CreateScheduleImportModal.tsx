import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import type { DataSource } from '../../services/dataApi'

interface CreateScheduleImportModalProps {
  open: boolean
  onClose: () => void
  sources: DataSource[]
  onSave: (payload: { name: string; sourceName: string; frequency: string }) => void
}

const FREQUENCIES = ['Every 15 minutes', 'Every hour', 'Every 4 hours', 'Daily', 'Weekly']

export function CreateScheduleImportModal({ open, onClose, sources, onSave }: CreateScheduleImportModalProps) {
  const [name, setName] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [frequency, setFrequency] = useState('Daily')

  useEffect(() => {
    if (open) {
      setName('')
      setSourceName(sources[0]?.name ?? '')
      setFrequency('Daily')
    }
  }, [open, sources])

  const handleSave = () => {
    if (!name.trim() || !sourceName) return
    onSave({ name: name.trim(), sourceName, frequency })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Import Schedule"
      maxWidth="max-w-md"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || !sourceName}
            className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light disabled:opacity-50"
          >
            Create Schedule
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm text-on-glass-muted">Import Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekly Sales Import"
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Data Source</label>
          <select
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  )
}
