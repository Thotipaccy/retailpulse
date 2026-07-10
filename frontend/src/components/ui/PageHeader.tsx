import { type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: { label: string; path?: string }[]
  actions?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-sm text-on-glass-muted">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.label} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                <span className={i === breadcrumbs.length - 1 ? 'font-medium text-copper-light' : ''}>{crumb.label}</span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-on-glass sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-on-glass-muted sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <GlassCard className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full glass-subtle text-on-glass-muted">{icon}</div>
      <h3 className="text-lg font-semibold text-on-glass">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-on-glass-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </GlassCard>
  )
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-copper-light" />
      <span className="sr-only">Loading...</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg glass-subtle" />
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl glass-subtle" />
      ))}
    </div>
  )
}

export function ConfirmModal({ isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'default', onConfirm, onCancel }: {
  isOpen: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string
  variant?: 'danger' | 'default'; onConfirm: () => void; onCancel: () => void
}) {
  useEscapeKey(isOpen, onCancel)

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <GlassCard strong className="relative w-full max-w-md p-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-on-glass">{title}</h2>
          <button type="button" onClick={onCancel} className="shrink-0 rounded-lg p-1 text-on-glass-muted hover:text-on-glass" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-on-glass-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${variant === 'danger' ? 'bg-rust hover:bg-rust-light' : 'bg-copper hover:bg-copper-light'}`}>{confirmLabel}</button>
        </div>
      </GlassCard>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <GlassCard className="p-8 text-center">
      <p className="text-rust-light">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light">Retry</button>
      )}
    </GlassCard>
  )
}
