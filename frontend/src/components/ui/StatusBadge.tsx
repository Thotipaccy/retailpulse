type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface StatusBadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  size?: 'sm' | 'md'
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-forest/10 text-forest border-forest/20',
  warning: 'bg-ochre/10 text-ochre border-ochre/30',
  danger: 'bg-rust/10 text-rust border-rust/20',
  info: 'bg-steel/10 text-steel border-steel/20',
  neutral: 'bg-charcoal-100 text-charcoal-600 border-charcoal-200',
}

export function StatusBadge({ variant, children, size = 'sm' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${variants[variant]} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {children}
    </span>
  )
}

export function getStockStatusBadge(status: string): BadgeVariant {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'low':
      return 'warning'
    case 'critical':
      return 'danger'
    case 'overstock':
      return 'info'
    default:
      return 'neutral'
  }
}

export function getChurnRiskBadge(score: number): { variant: BadgeVariant; label: string } {
  if (score >= 0.8) return { variant: 'danger', label: 'Critical' }
  if (score >= 0.6) return { variant: 'danger', label: 'High' }
  if (score >= 0.4) return { variant: 'warning', label: 'Medium' }
  return { variant: 'success', label: 'Low' }
}

export function getUploadStatusBadge(status: string): BadgeVariant {
  switch (status) {
    case 'success':
      return 'success'
    case 'processing':
      return 'info'
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}
