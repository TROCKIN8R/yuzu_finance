import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { monthEndForDate, formatPeriodLabel, dateOnly } from '../lib/fiscalPeriodClose'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'
import { Button } from '../components/Button'
import { Field, inputClass } from '../components/Field'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { EmptyState } from '../components/EmptyState'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function PeriodClosePage() {
  const { closes, loading, reload } = usePeriodCloseGuard()
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()))
  const [notes, setNotes] = useState('')

  const closedSet = useMemo(() => new Set(closes.map((c) => dateOnly(c.period_end))), [closes])

  async function closePeriod() {
    const periodEnd = monthEndForDate(`${selectedMonth}-15`)
    if (closedSet.has(periodEnd)) {
      alert('Cette période est déjà clôturée.')
      return
    }
    const { error: insertErr } = await supabase.from('fiscal_period_closes').insert({
      period_end: periodEnd,
      notes: notes.trim() || null,
    })
    if (insertErr) {
      alert(
        insertErr.message.includes('fiscal_period_closes')
          ? 'Table fiscal_period_closes manquante — exécutez la migration 20260703150000_p4_accounting_features.sql.'
          : insertErr.message
      )
      return
    }
    setNotes('')
    await reload()
  }

  async function reopen(periodEnd: string) {
    if (!confirm(`Rouvrir ${formatPeriodLabel(periodEnd)} ?`)) return
    const { error } = await supabase.from('fiscal_period_closes').delete().eq('period_end', periodEnd)
    if (error) {
      alert(error.message)
      return
    }
    await reload()
  }

  const targetEnd = monthEndForDate(`${selectedMonth}-15`)

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Clôture de période"
        subtitle="Verrouille un mois comptable : paie, banque, factures, temps, taxes et ajustements — brouillon pour révision CPA."
      />

      <div className="card p-4 space-y-4 mb-6">
        <Field label="Mois à clôturer">
          <input
            type="month"
            className={inputClass}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </Field>
        <Field label="Notes (optionnel)">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-sm text-muted">
          Fin de période : <strong>{targetEnd}</strong>
          {closedSet.has(targetEnd) ? ' · déjà clôturée' : ''}
        </p>
        <Button type="button" onClick={closePeriod} disabled={closedSet.has(targetEnd)}>
          Clôturer {formatPeriodLabel(targetEnd)}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted">Chargement…</p>
      ) : closes.length === 0 ? (
        <EmptyState message="Aucune période clôturée. Clôturez un mois une fois le rapprochement bancaire et la paie complétés." />
      ) : (
        <ul className="space-y-2">
          {closes.map((c) => (
            <li key={c.id} className="card p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{formatPeriodLabel(c.period_end)}</p>
                <p className="text-sm text-muted">
                  Clôturée le {new Date(c.closed_at).toLocaleDateString('fr-CA')}
                  {c.notes ? ` · ${c.notes}` : ''}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => reopen(c.period_end)}>
                Rouvrir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
