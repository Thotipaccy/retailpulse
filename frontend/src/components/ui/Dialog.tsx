import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { GlassCard } from './GlassCard'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export function Dialog({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <GlassCard strong className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col p-6`}>
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-on-glass">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-on-glass-muted hover:text-on-glass" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3 shrink-0">{footer}</div>}
      </GlassCard>
    </div>
  )
}
