import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { formatRWF } from '../../utils/format'

interface SetSalesGoalModalProps {
  open: boolean
  onClose: () => void
  currentGoal?: number
  onSave: (amount: number) => void
  onReset: () => void
}

export function SetSalesGoalModal({ open, onClose, currentGoal, onSave, onReset }: SetSalesGoalModalProps) {
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (open) setAmount(currentGoal ? String(currentGoal) : '')
  }, [open, currentGoal])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set Sales Target"
      maxWidth="max-w-md"
      footer={(
        <>
          {currentGoal && (
            <button type="button" onClick={() => { onReset(); onClose() }} className="mr-auto text-sm text-rust-light hover:underline">
              Reset Goal
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button
            type="button"
            disabled={!amount || Number(amount) <= 0}
            onClick={() => { onSave(Number(amount)); onClose() }}
            className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light disabled:opacity-50"
          >
            Save
          </button>
        </>
      )}
    >
      <p className="mb-4 text-sm text-on-glass-muted">
        This target applies to the current period view.
      </p>
      <label className="text-sm text-on-glass-muted">Target Amount (RWF)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="e.g. 5000000"
        className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
      />
      {currentGoal && (
        <p className="mt-2 text-xs text-on-glass-muted">Current goal: {formatRWF(currentGoal)}</p>
      )}
    </Dialog>
  )
}
