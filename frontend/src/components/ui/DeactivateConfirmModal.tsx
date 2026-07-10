import { ConfirmModal } from './PageHeader'

interface DeactivateConfirmModalProps {
  isOpen: boolean
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeactivateConfirmModal({ isOpen, itemName, onConfirm, onCancel }: DeactivateConfirmModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Confirm deactivation"
      message={`Are you sure? This will deactivate ${itemName}. Historical data will be preserved.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
