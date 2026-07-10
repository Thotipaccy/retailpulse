import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'

interface ReportConfigModalProps {
  open: boolean
  onClose: () => void
  templateName?: string
  onSave: (config: {
    name: string
    frequency: string
    format: string
    recipients: string
    customRange: boolean
    dateStart: string
    dateEnd: string
  }) => void
}

export function ReportConfigModal({ open, onClose, templateName, onSave }: ReportConfigModalProps) {
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('Weekly')
  const [format, setFormat] = useState('PDF')
  const [recipients, setRecipients] = useState('managers@retailpulse.rw')
  const [customRange, setCustomRange] = useState(false)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  useEffect(() => {
    if (open) {
      setName(templateName ? `${templateName} Report` : '')
      setFrequency('Weekly')
      setFormat('PDF')
      setRecipients('managers@retailpulse.rw')
      setCustomRange(false)
      setDateStart('')
      setDateEnd('')
    }
  }, [open, templateName])

  const handleSave = () => {
    onSave({ name, frequency, format, recipients, customRange, dateStart, dateEnd })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Configure Report Template"
      maxWidth="max-w-md"
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
      <div className="space-y-4">
        <div>
          <label className="text-sm text-on-glass-muted">Report Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Frequency</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
            <option>Daily</option>
            <option>Weekly</option>
            <option>Monthly</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Format Preference</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
            <option>PDF</option>
            <option>Excel</option>
            <option>CSV</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Recipients</label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="email@retailpulse.rw, team@retailpulse.rw"
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-on-glass">
          <input type="checkbox" checked={customRange} onChange={(e) => setCustomRange(e.target.checked)} className="accent-copper" />
          Custom date range
        </label>
        {customRange && (
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="glass-input rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="glass-input rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
      </div>
    </Dialog>
  )
}
