import type { ReactNode } from 'react'

export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ui-card px-4 py-3">
      <div className="ui-metric-label">{label}</div>
      <div className="ui-metric-value">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  )
}

export function MetricGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const colClass = cols === 4 ? 'sm:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  return <div className={`grid grid-cols-1 ${colClass} gap-3`}>{children}</div>
}
