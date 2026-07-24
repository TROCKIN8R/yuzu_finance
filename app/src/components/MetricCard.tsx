import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MomChange } from '../lib/dashboardKpis'

export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ui-card px-4 py-3">
      <div className="ui-metric-label">{label}</div>
      <div className="ui-metric-value">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  )
}

export function TrendBadge({ change, label = 'vs mois prec.' }: { change: MomChange; label?: string }) {
  if (change.direction === 'na' && change.prior === 0 && change.current === 0) {
    return <span className="text-xs text-muted">{label}: —</span>
  }

  const color =
    change.direction === 'up'
      ? 'text-emerald-700 bg-emerald-50'
      : change.direction === 'down'
        ? 'text-red-700 bg-red-50'
        : 'text-muted bg-stone-50'

  const arrow = change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '→'
  const pctText = change.pct != null ? `${change.pct > 0 ? '+' : ''}${change.pct.toFixed(1)} %` : 'nouveau'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${color}`}>
      <span aria-hidden>{arrow}</span>
      <span>{pctText}</span>
      {label ? <span className="text-muted font-normal">{label}</span> : null}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  to,
  dense = false,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  trend?: MomChange
  trendLabel?: string
  to?: string
  /** Compact padding and typography for dense dashboards. */
  dense?: boolean
}) {
  const inner = dense ? (
    <div className="ui-card px-3 py-2.5 h-full flex flex-col gap-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="ui-metric-label leading-tight">{label}</div>
        {trend && <TrendBadge change={trend} label="" />}
      </div>
      <div className="text-lg font-semibold tracking-tight tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted leading-snug">{sub}</div>}
    </div>
  ) : (
    <div className="ui-card px-4 py-4 h-full flex flex-col gap-1">
      <div className="ui-metric-label">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {trend && (
        <div className="mt-auto pt-2">
          <TrendBadge change={trend} label={trendLabel} />
        </div>
      )}
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block h-full hover:ring-2 hover:ring-yuzu/30 rounded-xl transition-shadow">
        {inner}
      </Link>
    )
  }
  return inner
}

export function MetricGrid({
  children,
  cols = 3,
  dense = false,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4
  dense?: boolean
}) {
  const colClass = cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
  return <div className={`grid grid-cols-1 ${colClass} ${dense ? 'gap-2' : 'gap-3'}`}>{children}</div>
}

export function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink mb-2">{title}</h2>
      {children}
    </section>
  )
}
