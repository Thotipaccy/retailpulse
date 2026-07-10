import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'

export interface ScheduledReportData {
  id: string
  name: string
  format: string
  frequency: string
  recipients: string
  active: boolean
  isActive: boolean
}

interface ScheduleReportModalProps {
  open: boolean
  onClose: () => void
  existingSchedule?: ScheduledReportData | null
  onSave: (data: Omit<ScheduledReportData, 'id' | 'isActive' | 'active'> & { active: boolean }) => void
}

export function ScheduleReportModal({ open, onClose, existingSchedule, onSave }: ScheduleReportModalProps) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState('PDF')
  const [frequency, setFrequency] = useState('Daily')
  const [recipients, setRecipients] = useState('')
  const [customRange, setCustomRange] = useState(false)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  useEffect(() => {
    if (open && existingSchedule) {
      setName(existingSchedule.name)
      setFormat(existingSchedule.format)
      setFrequency(existingSchedule.frequency.split(' · ')[0] ?? existingSchedule.frequency)
      setRecipients(existingSchedule.recipients)
    } else if (open) {
      setName('')
      setFormat('PDF')
      setFrequency('Daily')
      setRecipients('')
      setCustomRange(false)
      setDateStart('')
      setDateEnd('')
    }
  }, [open, existingSchedule])

  const handleSave = () => {
    onSave({
      name,
      format,
      frequency: customRange && dateStart && dateEnd
        ? `Custom: ${dateStart} – ${dateEnd}`
        : frequency,
      recipients,
      active: existingSchedule?.active ?? true,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existingSchedule ? 'Edit Scheduled Report' : 'Schedule Report'}
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
          <label className="text-sm text-on-glass-muted">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
            <option>PDF</option>
            <option>Excel</option>
            <option>CSV</option>
            <option>PPTX</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Recipients (comma-separated emails)</label>
          <input type="text" value={recipients} onChange={(e) => setRecipients(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
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
