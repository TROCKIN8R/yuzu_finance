import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { monthEndForDate, formatPeriodLabel, dateOnly } from '../lib/fiscalPeriodClose'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'
import { computeUnbilledWipAsOf } from '../lib/wipAccrual'
import { TIME_ENTRY_SELECT } from '../lib/dashboardData'
import { entriesToMetrics, type TimeEntryWithLines } from '../lib/timeEntries'
import type { MetricsProject } from '../lib/billingMetrics'
import { formatCad } from '../lib/format'
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
  const [wipEnabled, setWipEnabled] = useState(false)
  const [wipAmount, setWipAmount] = useState(0)
  const [wipHours, setWipHours] = useState(0)
  const [wipLoading, setWipLoading] = useState(false)

  const closedSet = useMemo(() => new Set(closes.map((c) => dateOnly(c.period_end))), [closes])
  const targetEnd = monthEndForDate(`${selectedMonth}-15`)

  useEffect(() => {
    void loadWipPreview(targetEnd)
  }, [targetEnd])

  async function loadWipPreview(periodEnd: string) {
    setWipLoading(true)
    const [settingsRow, invoices, timeEntries, fixedProjects] = await Promise.all([
      supabase.from('organization_settings').select('wip_accrual_enabled').maybeSingle(),
      supabase.from('invoices').select('id, invoice_date'),
      supabase.from('time_entries').select(TIME_ENTRY_SELECT),
      supabase
        .from('projects')
        .select('id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate')
        .eq('billing_type', 'fixed'),
    ])

    const enabled = Boolean(settingsRow.data?.wip_accrual_enabled)
    setWipEnabled(enabled)
    if (!enabled) {
      setWipAmount(0)
      setWipHours(0)
      setWipLoading(false)
      return
    }

    const invoiceDates = new Map((invoices.data ?? []).map((inv) => [inv.id, inv.invoice_date]))
    const wip = computeUnbilledWipAsOf(
      entriesToMetrics((timeEntries.data ?? []) as TimeEntryWithLines[]),
      (fixedProjects.data ?? []) as MetricsProject[],
      periodEnd,
      invoiceDates
    )
    setWipAmount(wip.amount)
    setWipHours(wip.hours)
    setWipLoading(false)
  }

  async function closePeriod() {
    const periodEnd = targetEnd
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

        <div className="rounded-lg border border-border bg-stone-50 p-3 text-sm space-y-1">
          <p className="font-medium text-ink">Travail non facturé (WIP)</p>
          {wipLoading ? (
            <p className="text-muted">Calcul…</p>
          ) : wipEnabled ? (
            <>
              <p>
                Au {formatPeriodLabel(targetEnd)} : <strong>{formatCad(wipAmount)}</strong>
                {wipHours > 0 ? ` (${wipHours} h horaire)` : ''}
              </p>
              <p className="text-xs text-muted">
                La clôture ne modifie pas les entrées de temps ni les factures. Avec WIP activé, le grand livre constate
                mensuellement Dr 1300 · Cr 4000 pour ce montant (voir Grand livre et États financiers).
              </p>
            </>
          ) : (
            <p className="text-muted text-xs">
              WIP désactivé — les revenus non facturés ne sont pas constatés en comptabilité.{' '}
              <Link to="/settings" className="text-yuzu-dark hover:underline">
                Activer dans Paramètres
              </Link>
              .
            </p>
          )}
        </div>

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
