import { Link } from 'react-router-dom'
import {
  COMPLIANCE_CATEGORY_LABELS,
  daysUntilDue,
  urgencyTone,
} from '../lib/compliance'
import { formatCad, formatDate } from '../lib/format'
import type { ComplianceDeadline } from '../lib/types'

function dueLabel(dueDate: string) {
  const d = daysUntilDue(dueDate)
  if (d < 0) return `En retard (${Math.abs(d)} j)`
  if (d === 0) return 'Aujourd’hui'
  if (d === 1) return 'Demain'
  return `Dans ${d} j`
}

function toneClass(dueDate: string) {
  const t = urgencyTone(dueDate)
  if (t === 'overdue') return 'text-red-700'
  if (t === 'soon') return 'text-amber-800'
  return 'text-muted'
}

export function UpcomingDeadlinesCard({
  rows,
  loading,
  compact = false,
}: {
  rows: ComplianceDeadline[]
  loading?: boolean
  compact?: boolean
}) {
  return (
    <div className={`ui-card flex flex-col ${compact ? 'p-3 gap-2' : 'p-4 gap-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Échéances à venir</h2>
          {!compact && <p className="text-xs text-muted mt-0.5">90 prochains jours · brouillon pour révision</p>}
        </div>
        <Link to="/compliance" className="text-xs font-medium text-yuzu-dark hover:underline shrink-0">
          Calendrier →
        </Link>
      </div>

      {loading && <p className="text-sm text-muted">Chargement…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted">
          Aucune échéance ouverte.{' '}
          <Link to="/compliance" className="font-medium text-yuzu-dark hover:underline">
            Générer le calendrier
          </Link>
        </p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex items-start justify-between gap-3 ${compact ? 'py-1.5 first:pt-0 last:pb-0' : 'py-2.5 first:pt-0 last:pb-0'}`}
            >
              <div className="min-w-0">
                <div className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>{r.title}</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {COMPLIANCE_CATEGORY_LABELS[r.category]} · {formatDate(r.due_date)}
                  {r.amount != null && Number(r.amount) !== 0 ? ` · ${formatCad(Number(r.amount))}` : ''}
                </div>
              </div>
              <span className={`text-[11px] font-medium shrink-0 ${toneClass(r.due_date)}`}>
                {dueLabel(r.due_date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
