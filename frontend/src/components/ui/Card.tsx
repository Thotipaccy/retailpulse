import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`glass rounded-xl glass-hover cursor-pointer ${className}`}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={`glass rounded-xl ${className}`}>
      {children}
    </div>
  )
}
