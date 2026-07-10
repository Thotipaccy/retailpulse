type PulseVariant = 'success' | 'warning' | 'danger'

const colors: Record<PulseVariant, string> = {
  success: 'bg-forest-light',
  warning: 'bg-ochre',
  danger: 'bg-rust-light',
}

interface PulseDotProps {
  variant?: PulseVariant
  className?: string
}

export function PulseDot({ variant = 'success', className = '' }: PulseDotProps) {
  return (
    <span className={`relative flex h-2.5 w-2.5 ${className}`}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colors[variant]}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colors[variant]}`} />
    </span>
  )
}
