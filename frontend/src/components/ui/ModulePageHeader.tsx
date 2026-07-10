import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { ROUTES } from '../../config/routes'

interface ModulePageHeaderProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  actions?: ReactNode
  badge?: ReactNode
}

export function ModulePageHeader({ icon: Icon, title, subtitle, actions, badge }: ModulePageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <nav className="mb-2 flex items-center gap-1 text-sm text-on-glass-muted">
          <Link to={ROUTES.DASHBOARD} className="hover:text-on-glass">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-on-glass">{title}</span>
        </nav>
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-copper/20">
            <Icon className="h-5 w-5 text-copper-light" />
            {badge}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-on-glass">{title}</h1>
            {subtitle && <p className="text-sm text-on-glass-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
