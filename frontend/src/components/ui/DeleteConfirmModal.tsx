import { ConfirmModal } from './PageHeader'

interface DeleteConfirmModalProps {
  isOpen: boolean
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ isOpen, itemName, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Permanently Delete Schedule"
      message={`You are about to permanently delete "${itemName}". This action cannot be undone and the schedule will stop running immediately.`}
      confirmLabel="Delete Permanently"
      cancelLabel="Keep Schedule"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
