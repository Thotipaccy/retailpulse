import { useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import type { User } from '../../types'

interface UserManagementModalProps {
  open: boolean
  onClose: () => void
  existingUser?: User | null
  onSave: (data: { fullName: string; email: string; role: User['role'] }) => void
}

export function UserManagementModal({ open, onClose, existingUser, onSave }: UserManagementModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<User['role']>('viewer')

  useEffect(() => {
    if (open) {
      setFullName(existingUser?.fullName ?? '')
      setEmail(existingUser?.email ?? '')
      setRole(existingUser?.role ?? 'viewer')
    }
  }, [open, existingUser])

  const handleSave = () => {
    onSave({ fullName, email, role })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existingUser ? 'Edit User' : 'Add User'}
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!fullName.trim() || !email.trim()}
            className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light disabled:opacity-50"
          >
            Save
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm text-on-glass-muted">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-on-glass-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as User['role'])}
            className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm capitalize"
          >
            <option value="administrator">Administrator</option>
            <option value="manager">Manager</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
    </Dialog>
  )
}
