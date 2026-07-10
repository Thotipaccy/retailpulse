import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type Tint = 'green' | 'amber' | 'red' | 'blue' | 'copper' | 'steel' | 'forest' | 'ochre'

const tints: Record<Tint, string> = {
  green: 'border-forest/25 bg-forest/10',
  amber: 'border-ochre/25 bg-ochre/10',
  red: 'border-rust/25 bg-rust/10',
  blue: 'border-steel/25 bg-steel/10',
  copper: 'border-copper/25 bg-copper/10',
  steel: 'border-steel/25 bg-steel/10',
  forest: 'border-forest/25 bg-forest/10',
  ochre: 'border-ochre/25 bg-ochre/10',
}

interface TintedKPICardProps {
  label: string
  value: string | number
  subtitle?: string
  tint?: Tint
  trend?: ReactNode
}

export function TintedKPICard({ label, value, subtitle, tint = 'copper', trend }: TintedKPICardProps) {
  return (
    <GlassCard className={`p-5 ${tints[tint]}`}>
      <p className="text-sm text-on-glass-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-on-glass">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-on-glass-muted">{subtitle}</p>}
      {trend}
    </GlassCard>
  )
}

