import { useEffect, useMemo, useState } from 'react'
import { formatCad, formatDate } from '../lib/format'
import { countActiveFilters, inDateRange } from '../lib/filters'
import {
  buildGeneralLedger,
  buildTrialBalance,
  CHART_OF_ACCOUNTS,
  flattenJournalEntries,
  journalTotals,
  type JournalEntry,
} from '../lib/generalLedger'
import { entriesThroughDate } from '../lib/ledgerBalances'
import { fetchGeneralLedgerData } from '../lib/glDataLoader'
import { exportJournalCsv, exportTrialBalanceCsv } from '../lib/exportCsv'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { DateRangeFilter, FilterSelect, ListToolbar, ViewToggle } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'

export function GeneralLedgerPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [view, setView] = useState<'journal' | 'trial'>('journal')
  const [loadWarnings, setLoadWarnings] = useState<string[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, warnings } = await fetchGeneralLedgerData()
    setLoadWarnings(warnings)
    setEntries(buildGeneralLedger(data))
    setLoading(false)
  }

  const journalEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!inDateRange(e.date, dateFrom, dateTo)) return false
      if (accountFilter && !e.lines.some((l) => l.accountCode === accountFilter)) return false
      return true
    })
  }, [entries, dateFrom, dateTo, accountFilter])

  const trialEntries = useMemo(() => {
    const asOf = dateTo || '9999-12-31'
    let scoped = entriesThroughDate(entries, asOf)
    if (dateFrom) scoped = scoped.filter((e) => e.date >= dateFrom)
    if (accountFilter) scoped = scoped.filter((e) => e.lines.some((l) => l.accountCode === accountFilter))
    return scoped
  }, [entries, dateFrom, dateTo, accountFilter])

  const activeEntries = view === 'journal' ? journalEntries : trialEntries
  const flatLines = useMemo(() => flattenJournalEntries(journalEntries), [journalEntries])
  const trial = useMemo(() => buildTrialBalance(trialEntries), [trialEntries])
  const totals = useMemo(() => journalTotals(journalEntries), [journalEntries])

  const hasFilters = !!(dateFrom || dateTo || accountFilter)
  const trialAsOfLabel = dateTo ? `Soldes cumulatifs au ${formatDate(dateTo)}` : 'Soldes cumulatifs (toutes dates)'

  if (loading) return <div className="text-muted">Chargement…</div>

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Grand livre"
        subtitle="Écritures en partie double — brouillon de gestion, valider avec votre CPA."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              view === 'journal'
                ? exportJournalCsv(journalEntries)
                : exportTrialBalanceCsv(trial)
            }
          >
            Exporter CSV
          </Button>
        }
      />

      {loadWarnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {loadWarnings.map((msg) => (
            <p key={msg} className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {msg}
            </p>
          ))}
        </div>
      )}

      <ViewToggle
        value={view}
        onChange={setView}
        label="Affichage"
        options={[
          { value: 'journal', label: 'Journal (activité)' },
          { value: 'trial', label: 'Balance (cumulatif)' },
        ]}
      />

      <ListToolbar
        hideSearch
        search=""
        onSearchChange={() => {}}
        resultCount={activeEntries.length}
        totalCount={entries.length}
        activeFilterCount={countActiveFilters(!!dateFrom, !!dateTo, !!accountFilter)}
        clearVisible={hasFilters}
        onClearFilters={() => {
          setDateFrom('')
          setDateTo('')
          setAccountFilter('')
        }}
      >
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <FilterSelect
          label="Compte"
          value={accountFilter}
          onChange={setAccountFilter}
          options={[
            { value: '', label: 'Tous' },
            ...CHART_OF_ACCOUNTS.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })),
          ]}
        />
      </ListToolbar>

      {view === 'journal' ? (
        journalEntries.length === 0 ? (
          <EmptyState message="Aucune écriture pour cette période." />
        ) : (
          <>
            <DataTable minWidth={960}>
              <thead className="bg-stone-50 text-muted text-left text-xs">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Réf.</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Compte</th>
                  <th className="px-3 py-3 text-right">Débit</th>
                  <th className="px-3 py-3 text-right">Crédit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {flatLines.map((line, i) => (
                  <tr key={`${line.entryId}-${line.accountCode}-${i}`} className="hover:bg-stone-50/50">
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{formatDate(line.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.reference}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-muted">
                      <span className="font-mono text-xs">{line.accountCode}</span> {line.accountName}
                    </td>
                    <td className="px-3 py-2 text-right">{line.debit > 0 ? formatCad(line.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right">{line.credit > 0 ? formatCad(line.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="text-right text-sm font-medium space-x-4">
              <span>Total débits : {formatCad(totals.debit)}</span>
              <span>Total crédits : {formatCad(totals.credit)}</span>
            </div>
          </>
        )
      ) : trial.length === 0 ? (
        <EmptyState message="Aucun solde pour cette sélection." />
      ) : (
        <>
          <p className="text-xs text-muted mb-3">{trialAsOfLabel}</p>
          <DataTable minWidth={720}>
            <thead className="bg-stone-50 text-muted text-left text-xs">
              <tr>
                <th className="px-3 py-3">Compte</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3 text-right">Débit</th>
                <th className="px-3 py-3 text-right">Crédit</th>
                <th className="px-3 py-3 text-right">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {trial.map((row) => (
                <tr key={row.accountCode}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{row.accountCode}</span> {row.accountName}
                  </td>
                  <td className="px-3 py-2 text-muted">{row.accountType}</td>
                  <td className="px-3 py-2 text-right">{row.debit > 0 ? formatCad(row.debit) : '—'}</td>
                  <td className="px-3 py-2 text-right">{row.credit > 0 ? formatCad(row.credit) : '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCad(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      <section className="bg-stone-50 border border-border rounded-xl p-4 text-xs text-muted space-y-2 mt-6">
        <p className="font-medium text-ink">Plan comptable simplifié</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
          {CHART_OF_ACCOUNTS.map((a) => (
            <div key={a.code}>
              <span className="font-mono">{a.code}</span> {a.name}
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  )
}
