interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  thin?: boolean
  className?: string
}

export function ProgressBar({ value, max = 100, color = '#B87333', thin = false, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={`overflow-hidden rounded-full bg-white/10 ${thin ? 'h-1.5' : 'h-2'} ${className}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, #D4914A)` }}
      />
    </div>
  )
}
