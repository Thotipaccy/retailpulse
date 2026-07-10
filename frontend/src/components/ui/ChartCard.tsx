import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, children, action, className = '' }: ChartCardProps) {
  return (
    <GlassCard className={`overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="font-semibold text-on-glass">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-on-glass-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </GlassCard>
  )
}
