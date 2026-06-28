import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BankTransaction } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { buildFinancialSnapshot } from '../lib/financials'
import { allTimeRange } from '../lib/fiscalPeriod'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

const empty = {
  transaction_date: todayIso(),
  description: '',
  amount: 0,
  reconciled: false,
  notes: '',
}

export function BankPage() {
  const [rows, setRows] = useState<BankTransaction[]>([])
  const [bookCash, setBookCash] = useState(0)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [bank, settings, payments, expenses, payroll, dividends, corpTax, salesTax] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('organization_settings').select('*').maybeSingle(),
      supabase.from('payments').select('amount, payment_date'),
      supabase.from('expenses').select('amount, total, paid, gst, qst, category, payroll_run_id, expense_date'),
      supabase
        .from('payroll_runs')
        .select(
          'payment_date, remittance_status, remittance_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay'
        ),
      supabase.from('dividends').select('total_amount, payment_date'),
      supabase.from('corporate_tax_records').select('amount, paid_amount, status'),
      supabase.from('sales_tax_periods').select('gst_net, qst_net, filed_date, period_end').eq('status', 'paid'),
    ])

    setRows((bank.data as BankTransaction[]) ?? [])
    const fin = buildFinancialSnapshot(
      {
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        payrollRuns: payroll.data ?? [],
        invoices: [],
        invoicePaidMap: {},
        dividends: dividends.data ?? [],
        corporateTax: corpTax.data ?? [],
        salesTaxRemitted: salesTax.data ?? [],
        bankTransactions: bank.data ?? [],
        settings: settings.data ?? undefined,
      },
      allTimeRange()
    )
    setBookCash(fin.netCash)
  }

  const bankBalance = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows])
  const variance = round2(bookCash - bankBalance)
  const unreconciled = rows.filter((r) => !r.reconciled).length

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('bank_transactions').insert({
      transaction_date: form.transaction_date,
      description: form.description,
      amount: form.amount,
      reconciled: form.reconciled,
      notes: form.notes || null,
    })
    setOpen(false)
    setForm(empty)
    load()
  }

  async function toggleReconciled(r: BankTransaction) {
    await supabase.from('bank_transactions').update({ reconciled: !r.reconciled }).eq('id', r.id)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette transaction bancaire ?')) return
    await supabase.from('bank_transactions').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rapprochement bancaire</h1>
          <p className="text-sm text-muted mt-1">Comparez le relevé bancaire et la trésorerie comptable.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Ajouter transaction</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted">Solde relevé (saisi)</div>
          <div className="text-xl font-semibold">{formatCad(bankBalance)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted">Trésorerie comptable</div>
          <div className="text-xl font-semibold">{formatCad(bookCash)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted">Écart</div>
          <div className={`text-xl font-semibold ${Math.abs(variance) > 1 ? 'text-amber-700' : ''}`}>{formatCad(variance)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted">Non rapprochées</div>
          <div className="text-xl font-semibold">{unreconciled}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Importez ou saisissez les mouvements de votre relevé bancaire." />
      ) : (
        <DataTable>
          <thead className="bg-stone-50 text-muted text-left text-sm">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Rapproché</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{formatDate(r.transaction_date)}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className={`px-4 py-3 text-right font-medium ${Number(r.amount) < 0 ? 'text-red-700' : ''}`}>{formatCad(r.amount)}</td>
                <td className="px-4 py-3">
                  <button type="button" className="text-yuzu-dark underline text-xs" onClick={() => toggleReconciled(r)}>
                    {r.reconciled ? 'Oui' : 'Non'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" className={tableActionClass} onClick={() => remove(r.id)}>Suppr.</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title="Transaction bancaire" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Date"><input type="date" className={inputClass} required value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} /></Field>
          <Field label="Description"><input className={inputClass} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Montant (+ dépôt / − retrait)"><input type="number" step="0.01" className={inputClass} required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reconciled} onChange={(e) => setForm({ ...form, reconciled: e.target.checked })} /> Rapproché</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </Modal>
    </div>
  )
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
