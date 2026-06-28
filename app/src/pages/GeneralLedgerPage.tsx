import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCad, formatDate } from '../lib/format'
import { inDateRange } from '../lib/filters'
import {
  buildGeneralLedger,
  buildTrialBalance,
  CHART_OF_ACCOUNTS,
  flattenJournalEntries,
  journalTotals,
  type JournalEntry,
} from '../lib/generalLedger'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { DateRangeFilter } from '../components/ListToolbar'

export function GeneralLedgerPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [view, setView] = useState<'journal' | 'trial'>('journal')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [invoices, payments, expenses, payroll, dividends, corpTax, salesTax] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, invoice_date, subtotal, gst, qst, total, status'),
      supabase.from('payments').select('id, payment_date, amount, invoice_id, reference, invoices(invoice_number)'),
      supabase.from('expenses').select('id, expense_date, vendor, category, description, amount, gst, qst, total, paid'),
      supabase
        .from('payroll_runs')
        .select(
          'id, payment_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay'
        ),
      supabase.from('dividends').select('id, payment_date, total_amount, description'),
      supabase.from('corporate_tax_records').select('id, paid_date, paid_amount, label, fiscal_year'),
      supabase.from('sales_tax_periods').select('id, period_end, filed_date, gst_net, qst_net, status'),
    ])

    setEntries(
      buildGeneralLedger({
        invoices: invoices.data ?? [],
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        payrollRuns: payroll.data ?? [],
        dividends: dividends.data ?? [],
        corporateTax: corpTax.data ?? [],
        salesTaxRemittances: salesTax.data ?? [],
      })
    )
    setLoading(false)
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!inDateRange(e.date, dateFrom, dateTo)) return false
      if (accountFilter && !e.lines.some((l) => l.accountCode === accountFilter)) return false
      return true
    })
  }, [entries, dateFrom, dateTo, accountFilter])

  const flatLines = useMemo(() => flattenJournalEntries(filteredEntries), [filteredEntries])
  const trial = useMemo(() => buildTrialBalance(filteredEntries), [filteredEntries])
  const totals = useMemo(() => journalTotals(filteredEntries), [filteredEntries])

  if (loading) return <div className="text-muted">Chargement…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Grand livre</h1>
        <p className="text-sm text-muted mt-1">
          Écritures en partie double générées depuis factures, paiements, dépenses, paie, dividendes et taxes.
          Brouillon de gestion — valider avec votre CPA.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView('journal')}
          className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${view === 'journal' ? 'bg-yuzu-light text-ink' : 'bg-white border border-border text-muted'}`}
        >
          Journal général
        </button>
        <button
          type="button"
          onClick={() => setView('trial')}
          className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${view === 'trial' ? 'bg-yuzu-light text-ink' : 'bg-white border border-border text-muted'}`}
        >
          Balance de vérification
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <label className="text-xs text-muted flex flex-col gap-1">
          Compte
          <select
            className="border border-border rounded-lg px-2 py-2 text-sm bg-white min-h-[44px]"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">Tous</option>
            {CHART_OF_ACCOUNTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted pb-2">
          {filteredEntries.length} écriture{filteredEntries.length !== 1 ? 's' : ''} sur {entries.length}
        </p>
      </div>

      {view === 'journal' ? (
        filteredEntries.length === 0 ? (
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
        <EmptyState message="Aucun solde pour cette période." />
      ) : (
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
      )}

      <section className="bg-stone-50 border border-border rounded-xl p-4 text-xs text-muted space-y-2">
        <p className="font-medium text-ink">Plan comptable simplifié</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
          {CHART_OF_ACCOUNTS.map((a) => (
            <div key={a.code}>
              <span className="font-mono">{a.code}</span> {a.name}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
