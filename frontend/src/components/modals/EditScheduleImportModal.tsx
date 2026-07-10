import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import type { DataSource, ScheduledImport } from '../../services/dataApi'

interface EditScheduleImportModalProps {
  open: boolean
  onClose: () => void
  sources: DataSource[]
  job: ScheduledImport | null
  onSave: (id: string, payload: { name: string; sourceName: string; frequency: string }) => void
}

const FREQUENCIES = ['Every 15 minutes', 'Every hour', 'Every 4 hours', 'Daily', 'Weekly']

export function EditScheduleImportModal({ open, onClose, sources, job, onSave }: EditScheduleImportModalProps) {
  const [name, setName] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [frequency, setFrequency] = useState('Daily')

  useEffect(() => {
    if (open && job) {
      setName(job.name)
      setSourceName(job.sourceName)
      setFrequency(job.frequency || 'Daily')
    }
  }, [open, job])

  const handleSave = () => {
    if (!name.trim() || !sourceName || !job) return
    onSave(job.id, { name: name.trim(), sourceName, frequency })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit Import Schedule"
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
            Save Changes
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="importName" className="text-sm text-on-glass-muted">Import Name</label>
          <input
            id="importName"
            type="text"
            title="Import Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="dataSource" className="text-sm text-on-glass-muted">Data Source</label>
          <select
            id="dataSource"
            title="Data Source"
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
          <label htmlFor="frequency" className="text-sm text-on-glass-muted">Frequency</label>
          <select
            id="frequency"
            title="Frequency"
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
