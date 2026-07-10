import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  strong?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className = '', hover = false, strong = false, onClick }: GlassCardProps) {
  const base = strong ? 'glass-strong' : 'glass'
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${base} rounded-xl ${hover ? 'glass-hover cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Wrapper>
  )
}
