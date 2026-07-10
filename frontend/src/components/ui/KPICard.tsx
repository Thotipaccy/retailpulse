import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Package, Target, TrendingUp, Users, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Sparkline } from './Sparkline'

const iconMap: Record<string, LucideIcon> = {
  TrendingUp, Wallet, Users, Package, AlertTriangle, Target,
}

interface KPICardProps {
  label: string
  value: string
  subtitle?: string
  trend?: number
  trendLabel?: string
  icon?: string
  sparkline?: number[]
  onClick?: () => void
}

export function KPICard({ label, value, subtitle, trend, trendLabel, icon = 'TrendingUp', sparkline, onClick }: KPICardProps) {
  const Icon = iconMap[icon] ?? TrendingUp
  const isPositive = trend !== undefined && trend >= 0
  const isNegativeMetric = label.toLowerCase().includes('low stock') || label.toLowerCase().includes('churn')
  const trendIsGood = isNegativeMetric ? !isPositive : isPositive
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className="w-full text-left">
      <GlassCard hover={!!onClick} className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-on-glass-muted">{label}</p>
            {subtitle && <p className="mt-0.5 text-xs text-on-glass-muted">{subtitle}</p>}
            <p className="mt-2 text-2xl font-bold tracking-tight text-on-glass sm:text-3xl">{value}</p>
            {trend !== undefined && (
              <div className="mt-2 flex items-center gap-1.5">
                {isPositive ? (
                  <ArrowUpRight className={`h-4 w-4 ${trendIsGood ? 'text-forest-light' : 'text-rust-light'}`} />
                ) : (
                  <ArrowDownRight className={`h-4 w-4 ${trendIsGood ? 'text-forest-light' : 'text-rust-light'}`} />
                )}
                <span className={`text-sm font-semibold ${trendIsGood ? 'text-forest-light' : 'text-rust-light'}`}>
                  {Math.abs(trend)}%
                </span>
                {trendLabel && <span className="text-xs text-on-glass-muted">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl glass-subtle">
            <Icon className="h-5 w-5 text-copper-light" aria-hidden="true" />
          </div>
        </div>
        {sparkline && sparkline.length > 0 && (
          <div className="mt-3 h-8 opacity-80">
            <Sparkline data={sparkline} color={trendIsGood ? '#3D7A5C' : '#B87333'} />
          </div>
        )}
      </GlassCard>
    </Wrapper>
  )
}
