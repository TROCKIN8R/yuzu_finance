import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  backTo?: { to: string; label: string }
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo.to} className="inline-flex items-center text-sm text-yuzu-dark hover:underline mb-1 min-h-[44px] sm:min-h-0">
            ← {backTo.label}
          </Link>
        )}
        {typeof title === 'string' ? <h1 className="text-xl sm:text-2xl font-semibold">{title}</h1> : title}
        {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto">{actions}</div>}
    </div>
  )
}

/** Compact section header (e.g. Payments subsections). */
export function SectionHeader({
  title,
  actions,
  className = 'mb-3',
}: {
  title: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      {typeof title === 'string' ? (
        <h2 className="text-sm font-medium text-muted">{title}</h2>
      ) : (
        title
      )}
      {actions}
    </div>
  )
}
