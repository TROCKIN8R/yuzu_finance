import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BankTransaction, Expense, ExpenseCategory, Invoice, OrganizationSettings, Partner, Payment } from '../lib/types'
import { formatCad, formatDate, relationOne } from '../lib/format'
import { buildFinancialSnapshot } from '../lib/financials'
import { allTimeRange } from '../lib/fiscalPeriod'
import { invoiceBalance } from '../lib/invoice'
import { providerPartners } from '../lib/partners'
import { computePurchaseTaxesFromTotal } from '../lib/taxes'
import {
  assignBankExpense,
  assignBankPayment,
  deleteBankTransaction,
  ignoreBankTransaction,
  importBankRows,
  unassignBankTransaction,
} from '../lib/bankActions'
import { parseWealthsimpleCsv, wealthsimpleFormatLabel } from '../lib/wealthsimpleCsv'
import { matchesSearch } from '../lib/filters'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, FilterSelect, ListToolbar } from '../components/ListToolbar'

const CATEGORIES: ExpenseCategory[] = ['software', 'office', 'travel', 'professional', 'marketing', 'payroll', 'other']

type AssignmentFilter = 'unassigned' | 'all' | 'payment' | 'expense' | 'ignored'
type AssignKind = 'payment' | 'expense'

interface InvoiceWithPaid extends Invoice {
  paid: number
  balance: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function inferPaymentMethod(description: string): string {
  const d = description.toLowerCase()
  if (d.includes('interac') || d.includes('e-transfer')) return 'interac'
  if (d.includes('cheque') || d.includes('chèque')) return 'cheque'
  if (d.includes('direct deposit') || d.includes('dépôt direct')) return 'virement'
  return 'virement'
}

function sourceLabel(tx: BankTransaction) {
  if (tx.source_format === 'chequing') return 'Chèques'
  if (tx.source_format === 'credit_card') return 'Carte'
  return 'Manuel'
}

export function BankPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BankTransaction[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithPaid[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [bookCash, setBookCash] = useState(0)
  const [paymentMap, setPaymentMap] = useState<Record<string, Payment>>({})
  const [expenseMap, setExpenseMap] = useState<Record<string, Expense>>({})

  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('unassigned')
  const [search, setSearch] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTx, setAssignTx] = useState<BankTransaction | null>(null)
  const [assignKind, setAssignKind] = useState<AssignKind>('expense')

  const [payForm, setPayForm] = useState({
    invoice_id: '',
    payment_date: '',
    amount: 0,
    method: 'virement',
    reference: '',
  })

  const [expForm, setExpForm] = useState({
    expense_date: '',
    partner_id: '',
    vendor: '',
    category: 'other' as ExpenseCategory,
    description: '',
    total: 0,
    amount: 0,
    gst: 0,
    qst: 0,
    applyTax: true,
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [bank, inv, pay, exp, part, set, payroll, dividends, corpTax, salesTax] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('invoices').select('*, partners(legal_name)').neq('status', 'void').order('invoice_date', { ascending: false }),
      supabase.from('payments').select('*, invoices(invoice_number, total, partner_id)'),
      supabase.from('expenses').select('*'),
      supabase.from('partners').select('*').order('legal_name'),
      supabase.from('organization_settings').select('*').maybeSingle(),
      supabase
        .from('payroll_runs')
        .select(
          'payment_date, remittance_status, remittance_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay'
        ),
      supabase.from('dividends').select('total_amount, payment_date'),
      supabase.from('corporate_tax_records').select('amount, paid_amount, status'),
      supabase.from('sales_tax_periods').select('gst_net, qst_net, filed_date, period_end').eq('status', 'paid'),
    ])

    const paidMap: Record<string, number> = {}
    for (const p of pay.data ?? []) {
      paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)
    }

    const enriched = (inv.data ?? []).map((i) => {
      const paid = paidMap[i.id] ?? 0
      return { ...(i as Invoice), paid, balance: invoiceBalance(Number(i.total), paid) }
    })

    const payments = (pay.data as Payment[]) ?? []
    const expenses = (exp.data as Expense[]) ?? []

    setRows((bank.data as BankTransaction[]) ?? [])
    setInvoices(enriched)
    setPartners((part.data as Partner[]) ?? [])
    setSettings(set.data)
    setPaymentMap(Object.fromEntries(payments.map((p) => [p.id, p])))
    setExpenseMap(Object.fromEntries(expenses.map((e) => [e.id, e])))

    const fin = buildFinancialSnapshot(
      {
        payments: payments.map((p) => ({ amount: p.amount, payment_date: p.payment_date })),
        expenses: expenses,
        payrollRuns: payroll.data ?? [],
        invoices: [],
        invoicePaidMap: {},
        dividends: dividends.data ?? [],
        corporateTax: corpTax.data ?? [],
        salesTaxRemitted: salesTax.data ?? [],
        bankTransactions: bank.data ?? [],
        settings: set.data ?? undefined,
      },
      allTimeRange()
    )
    setBookCash(fin.netCash)
  }

  async function handleCsvUpload(file: File) {
    setImportMsg(null)
    const text = await file.text()
    const { rows: parsed, format, skipped } = parseWealthsimpleCsv(text)
    if (!format || parsed.length === 0) {
      setImportMsg('Format CSV non reconnu. Utilisez un export Wealthsimple (chèques ou carte de crédit).')
      return
    }
    try {
      const { inserted, duplicates } = await importBankRows(parsed)
      const parts = [
        `${inserted} transaction${inserted !== 1 ? 's' : ''} importée${inserted !== 1 ? 's' : ''}`,
        wealthsimpleFormatLabel(format),
      ]
      if (duplicates > 0) parts.push(`${duplicates} doublon${duplicates !== 1 ? 's' : ''} ignoré${duplicates !== 1 ? 's' : ''}`)
      if (skipped > 0) parts.push(`${skipped} ligne${skipped !== 1 ? 's' : ''} filtrée${skipped !== 1 ? 's' : ''} (carte)`)
      setImportMsg(parts.join(' · '))
      load()
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Erreur import')
    }
  }

  function recalcExpenseTaxes(total: number, applyTax: boolean) {
    if (!settings || !applyTax) {
      return { amount: round2(total), gst: 0, qst: 0, total: round2(total) }
    }
    const t = computePurchaseTaxesFromTotal(total, settings)
    return { amount: t.subtotal, gst: t.gst, qst: t.qst, total: t.total }
  }

  function openAssign(tx: BankTransaction) {
    setAssignTx(tx)
    const kind: AssignKind = Number(tx.amount) > 0 ? 'payment' : 'expense'
    setAssignKind(kind)

    if (kind === 'payment') {
      const defaultInv = invoices.find((i) => i.balance > 0)
      setPayForm({
        invoice_id: defaultInv?.id ?? '',
        payment_date: tx.transaction_date,
        amount: round2(Math.abs(Number(tx.amount))),
        method: inferPaymentMethod(tx.description),
        reference: tx.description.slice(0, 120),
      })
    } else {
      const total = round2(Math.abs(Number(tx.amount)))
      const taxes = recalcExpenseTaxes(total, true)
      setExpForm({
        expense_date: tx.transaction_date,
        partner_id: '',
        vendor: '',
        category: 'other',
        description: tx.description,
        total,
        amount: taxes.amount,
        gst: taxes.gst,
        qst: taxes.qst,
        applyTax: true,
      })
    }
    setAssignOpen(true)
  }

  function onExpenseTotalChange(total: number) {
    const taxes = recalcExpenseTaxes(total, expForm.applyTax)
    setExpForm({ ...expForm, total, ...taxes })
  }

  function onExpenseTaxToggle(applyTax: boolean) {
    const taxes = recalcExpenseTaxes(expForm.total, applyTax)
    setExpForm({ ...expForm, applyTax, ...taxes })
  }

  function onPartnerSelect(partnerId: string) {
    const partner = partners.find((p) => p.id === partnerId)
    setExpForm({
      ...expForm,
      partner_id: partnerId,
      vendor: partner?.legal_name ?? expForm.vendor,
    })
  }

  async function saveAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTx) return
    try {
      if (assignKind === 'payment') {
        await assignBankPayment(
          assignTx.id,
          payForm.invoice_id,
          payForm.payment_date,
          payForm.amount,
          payForm.method || null,
          payForm.reference || null
        )
      } else {
        const vendor = expForm.vendor.trim()
        if (!vendor) {
          alert('Indiquez un fournisseur.')
          return
        }
        await assignBankExpense(assignTx.id, {
          expense_date: expForm.expense_date,
          vendor,
          category: expForm.category,
          description: expForm.description || null,
          amount: expForm.amount,
          gst: expForm.gst,
          qst: expForm.qst,
          total: expForm.total,
        })
      }
      setAssignOpen(false)
      setAssignTx(null)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleIgnore(tx: BankTransaction) {
    if (!confirm('Ignorer cette transaction (virement interne, doublon, etc.) ?')) return
    await ignoreBankTransaction(tx.id)
    load()
  }

  async function handleUnassign(tx: BankTransaction) {
    if (!confirm('Retirer l\'affectation et supprimer le paiement/dépense lié ?')) return
    try {
      await unassignBankTransaction(tx.id, tx.match_source, tx.match_id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete(tx: BankTransaction) {
    if (!confirm('Supprimer cette transaction bancaire ?')) return
    try {
      await deleteBankTransaction(tx.id, tx.match_source, tx.match_id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const bankBalance = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows])
  const variance = round2(bookCash - bankBalance)
  const unassignedCount = rows.filter((r) => !r.match_source).length

  const matchLabel = (tx: BankTransaction) => {
    if (!tx.match_source) return null
    if (tx.match_source === 'manual') return 'Ignorée'
    if (tx.match_source === 'payment' && tx.match_id) {
      const p = paymentMap[tx.match_id]
      const inv = relationOne(p?.invoices)
      return inv ? `Paiement · ${inv.invoice_number}` : 'Paiement'
    }
    if (tx.match_source === 'expense' && tx.match_id) {
      const ex = expenseMap[tx.match_id]
      return ex ? `Dépense · ${ex.vendor}` : 'Dépense'
    }
    return tx.match_source
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (assignmentFilter === 'unassigned' && r.match_source) return false
      if (assignmentFilter === 'payment' && r.match_source !== 'payment') return false
      if (assignmentFilter === 'expense' && r.match_source !== 'expense') return false
      if (assignmentFilter === 'ignored' && r.match_source !== 'manual') return false
      return matchesSearch(search, r.description, r.transaction_code, r.amount, sourceLabel(r), matchLabel(r))
    })
  }, [rows, assignmentFilter, search, paymentMap, expenseMap])

  const outstanding = invoices.filter((i) => i.balance > 0)
  const vendors = providerPartners(partners)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Banque</h1>
          <p className="text-sm text-muted mt-1">
            Importez vos relevés Wealthsimple, puis affectez chaque transaction à une facture ou une dépense.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleCsvUpload(f)
              e.target.value = ''
            }}
          />
          <Button type="button" onClick={() => fileRef.current?.click()}>
            Importer CSV
          </Button>
        </div>
      </div>

      {importMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {importMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted">Solde relevé (importé)</div>
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
          <div className="text-xs text-muted">Non affectées</div>
          <div className="text-xl font-semibold">{unassignedCount}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Importez un CSV Wealthsimple (compte chèques ou carte de crédit) pour commencer." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Description, code, montant…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterSelect
              label="Affectation"
              value={assignmentFilter}
              onChange={(v) => setAssignmentFilter(v as AssignmentFilter)}
              options={[
                { value: 'unassigned', label: 'Non affectées' },
                { value: 'all', label: 'Toutes' },
                { value: 'payment', label: 'Paiements clients' },
                { value: 'expense', label: 'Dépenses' },
                { value: 'ignored', label: 'Ignorées' },
              ]}
            />
            <ClearFiltersButton
              visible={assignmentFilter !== 'unassigned' || !!search}
              onClick={() => {
                setAssignmentFilter('unassigned')
                setSearch('')
              }}
            />
          </ListToolbar>

          {filtered.length === 0 ? (
            <EmptyState message="Aucune transaction ne correspond aux filtres." />
          ) : (
            <DataTable>
              <thead className="bg-stone-50 text-muted text-left text-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3">Affectation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filtered.map((r) => {
                  const label = matchLabel(r)
                  return (
                    <tr key={r.id} className={!r.match_source ? 'bg-amber-50/40' : undefined}>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.transaction_date)}</td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {sourceLabel(r)}
                        {r.transaction_code && <span className="block">{r.transaction_code}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={r.description}>{r.description}</td>
                      <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${Number(r.amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatCad(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {label ? (
                          <Badge label={label} tone={r.match_source === 'manual' ? 'draft' : 'paid'} />
                        ) : (
                          <span className="text-amber-700 text-xs font-medium">À affecter</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                        {!r.match_source && (
                          <>
                            <Button variant="ghost" className={tableActionClass} onClick={() => openAssign(r)}>
                              Affecter
                            </Button>
                            <Button variant="ghost" className={tableActionClass} onClick={() => handleIgnore(r)}>
                              Ignorer
                            </Button>
                          </>
                        )}
                        {r.match_source && r.match_source !== 'manual' && (
                          <Button variant="ghost" className={tableActionClass} onClick={() => handleUnassign(r)}>
                            Retirer
                          </Button>
                        )}
                        <Button variant="danger" className={tableActionClass} onClick={() => handleDelete(r)}>
                          Suppr.
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      <Modal title="Affecter la transaction" open={assignOpen} onClose={() => setAssignOpen(false)} wide>
        {assignTx && (
          <div className="mb-4 rounded-lg bg-stone-50 border border-border px-3 py-2 text-sm">
            <span className="text-muted">{formatDate(assignTx.transaction_date)} · </span>
            <span>{assignTx.description}</span>
            <span className={`ml-2 font-medium ${Number(assignTx.amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {formatCad(assignTx.amount)}
            </span>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={`px-3 py-2 rounded-lg text-sm border ${assignKind === 'payment' ? 'bg-yuzu-light border-yuzu font-medium' : 'border-border'}`}
            onClick={() => setAssignKind('payment')}
            disabled={assignTx != null && Number(assignTx.amount) <= 0}
          >
            Paiement client
          </button>
          <button
            type="button"
            className={`px-3 py-2 rounded-lg text-sm border ${assignKind === 'expense' ? 'bg-yuzu-light border-yuzu font-medium' : 'border-border'}`}
            onClick={() => setAssignKind('expense')}
            disabled={assignTx != null && Number(assignTx.amount) >= 0}
          >
            Dépense
          </button>
        </div>

        <form onSubmit={saveAssignment} className="space-y-3">
          {assignKind === 'payment' ? (
            <>
              {outstanding.length === 0 ? (
                <p className="text-sm text-amber-800">Aucune facture ouverte — créez une facture d&apos;abord.</p>
              ) : (
                <>
                  <Field label="Facture *">
                    <select
                      className={inputClass}
                      required
                      value={payForm.invoice_id}
                      onChange={(e) => {
                        const inv = invoices.find((i) => i.id === e.target.value)
                        setPayForm({ ...payForm, invoice_id: e.target.value, amount: inv?.balance ?? payForm.amount })
                      }}
                    >
                      {outstanding.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} — {inv.partners?.legal_name} — solde {formatCad(inv.balance)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Date de paiement *">
                      <input
                        type="date"
                        className={inputClass}
                        required
                        value={payForm.payment_date}
                        onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                      />
                    </Field>
                    <Field label="Montant *">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={inputClass}
                        required
                        value={payForm.amount}
                        onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                  <Field label="Méthode">
                    <select className={inputClass} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                      <option value="virement">Virement</option>
                      <option value="interac">Interac</option>
                      <option value="cheque">Chèque</option>
                      <option value="autre">Autre</option>
                    </select>
                  </Field>
                  <Field label="Référence">
                    <input className={inputClass} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                  </Field>
                </>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Date de dépense *">
                  <input
                    type="date"
                    className={inputClass}
                    required
                    value={expForm.expense_date}
                    onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
                  />
                </Field>
                <Field label="Catégorie">
                  <select
                    className={inputClass}
                    value={expForm.category}
                    onChange={(e) => setExpForm({ ...expForm, category: e.target.value as ExpenseCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {expForm.category === 'payroll' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  La catégorie « paie » est réservée aux ajustements — utilisez la page Paie pour les salaires.
                </p>
              )}
              <Field label="Fournisseur (partenaire)">
                <select className={inputClass} value={expForm.partner_id} onChange={(e) => onPartnerSelect(e.target.value)}>
                  <option value="">— Personnalisé —</option>
                  {vendors.map((p) => (
                    <option key={p.id} value={p.id}>{p.legal_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nom du fournisseur *">
                <input
                  className={inputClass}
                  required
                  value={expForm.vendor}
                  onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value, partner_id: '' })}
                  placeholder="Nom affiché sur la dépense"
                />
              </Field>
              <Field label="Description">
                <input className={inputClass} value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expForm.applyTax} onChange={(e) => onExpenseTaxToggle(e.target.checked)} />
                Calculer TPS/TVQ (Québec) à partir du total TTC
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Total TTC *">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    required
                    value={expForm.total}
                    onChange={(e) => onExpenseTotalChange(Number(e.target.value))}
                  />
                </Field>
                <Field label="Montant HT">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                  />
                </Field>
                <Field label="TPS (CTI)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={expForm.gst}
                    onChange={(e) => setExpForm({ ...expForm, gst: Number(e.target.value) })}
                  />
                </Field>
                <Field label="TVQ (RTI)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={expForm.qst}
                    onChange={(e) => setExpForm({ ...expForm, qst: Number(e.target.value) })}
                  />
                </Field>
              </div>
              {settings && expForm.applyTax && (
                <p className="text-xs text-muted">
                  TPS {Math.round(settings.gst_rate * 10000) / 100}% · TVQ {Math.round(settings.qst_rate * 10000) / 100}% sur HT+TPS
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button
              type="submit"
              disabled={assignKind === 'payment' && outstanding.length === 0}
            >
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
