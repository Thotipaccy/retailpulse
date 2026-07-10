import type { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  chart?: ReactNode
  className?: string
}

export function StatCard({ title, value, subtitle, chart, className = '' }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-charcoal-200 bg-white p-5 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-charcoal-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-charcoal-800">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-charcoal-400">{subtitle}</p>}
        </div>
      </div>
      {chart && <div className="mt-4 h-24">{chart}</div>}
    </div>
  )
}
