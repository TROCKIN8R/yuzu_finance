import { useMemo, useState } from 'react'
import { formatCad } from '../lib/format'
import type { BreakdownRow } from '../lib/billingMetrics'

type BreakdownMode = 'amount' | 'rate'

function BreakdownToggle({ mode, onChange }: { mode: BreakdownMode; onChange: (mode: BreakdownMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
      <button
        type="button"
        className={`px-2.5 py-1 ${mode === 'amount' ? 'bg-yuzu-light text-ink font-medium' : 'bg-white text-muted'}`}
        onClick={() => onChange('amount')}
      >
        $
      </button>
      <button
        type="button"
        className={`px-2.5 py-1 ${mode === 'rate' ? 'bg-yuzu-light text-ink font-medium' : 'bg-white text-muted'}`}
        onClick={() => onChange('rate')}
      >
        $/h
      </button>
    </div>
  )
}

function metricValue(row: BreakdownRow, key: 'worked' | 'invoiced' | 'collected', mode: BreakdownMode) {
  if (mode === 'rate') {
    if (row.hours <= 0) return '—'
    return `${formatCad(row[key] / row.hours)}/h`
  }
  return formatCad(row[key])
}

export function ExecutiveBreakdownPanel({
  title,
  rows,
  emptyMessage,
}: {
  title: string
  rows: BreakdownRow[]
  emptyMessage: string
}) {
  const [mode, setMode] = useState<BreakdownMode>('amount')

  const totals = useMemo(() => {
    const worked = rows.reduce((s, r) => s + r.worked, 0)
    const invoiced = rows.reduce((s, r) => s + r.invoiced, 0)
    const collected = rows.reduce((s, r) => s + r.collected, 0)
    const hours = rows.reduce((s, r) => s + r.hours, 0)
    return { worked, invoiced, collected, hours }
  }, [rows])

  return (
    <div className="ui-card p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        <BreakdownToggle mode={mode} onChange={setMode} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted flex-1">{emptyMessage}</p>
      ) : (
        <div className="overflow-auto flex-1 -mx-1 px-1">
          <table className="w-full text-sm min-w-[320px]">
            <thead className="text-xs text-muted text-left border-b border-border">
              <tr>
                <th className="py-2 pr-2 font-medium">Nom</th>
                <th className="py-2 pr-2 font-medium text-right">Prestations</th>
                <th className="py-2 pr-2 font-medium text-right">Facturé</th>
                <th className="py-2 font-medium text-right">Encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-2 font-medium truncate max-w-[140px]" title={row.label}>
                    {row.label}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{metricValue(row, 'worked', mode)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{metricValue(row, 'invoiced', mode)}</td>
                  <td className="py-2 text-right tabular-nums">{metricValue(row, 'collected', mode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border text-xs font-medium">
              <tr>
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {mode === 'rate' && totals.hours > 0 ? `${formatCad(totals.worked / totals.hours)}/h` : formatCad(totals.worked)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {mode === 'rate' && totals.hours > 0 ? `${formatCad(totals.invoiced / totals.hours)}/h` : formatCad(totals.invoiced)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {mode === 'rate' && totals.hours > 0 ? `${formatCad(totals.collected / totals.hours)}/h` : formatCad(totals.collected)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
