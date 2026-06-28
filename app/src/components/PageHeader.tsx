import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6 ${className}`}>
      <div className="min-w-0">
        {typeof title === 'string' ? <h1 className="text-xl sm:text-2xl font-semibold">{title}</h1> : title}
        {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
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
