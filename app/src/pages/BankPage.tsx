import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  BankTransaction,
  CorporateTaxRecord,
  Dividend,
  Expense,
  ExpenseCategory,
  Invoice,
  OrganizationSettings,
  Partner,
  Payment,
  SalesTaxPeriod,
} from '../lib/types'
import { formatCad, formatDate, relationOne } from '../lib/format'
import { buildFinancialSnapshot, payrollRemittancesTotal } from '../lib/financials'
import { allTimeRange } from '../lib/fiscalPeriod'
import { invoiceBalance } from '../lib/invoice'
import { providerPartners } from '../lib/partners'
import { employeeDisplayName } from '../lib/payrollCalc'
import { computePurchaseTaxesFromTotal } from '../lib/taxes'
import {
  assignBankCorporateTax,
  assignBankDividend,
  assignBankExpense,
  assignBankPayment,
  assignBankPayroll,
  assignBankSalesTax,
  deleteBankTransaction,
  ignoreBankTransaction,
  importBankRows,
  unassignBankTransaction,
  type PayrollBankMatchKind,
} from '../lib/bankActions'
import { parseWealthsimpleCsv, wealthsimpleFormatLabel } from '../lib/wealthsimpleCsv'
import { bankImportSetupHint, errorMessage } from '../lib/errors'
import { matchesSearch } from '../lib/filters'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { MetricCard, MetricGrid } from '../components/MetricCard'
import { AlertBanner } from '../components/AlertBanner'

const CATEGORIES: ExpenseCategory[] = ['software', 'office', 'travel', 'professional', 'marketing', 'payroll', 'other']

/** Partial payroll rows loaded for bank assignment UI. */
type BankPayrollRun = {
  id: string
  payment_date: string
  pay_period_start: string
  pay_period_end: string
  net_pay: number
  remittance_status: 'pending' | 'remitted'
  remittance_date: string | null
  remittance_reference: string | null
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  other_deductions: number
  employer_benefits: number
  employees?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[]
}

type AssignmentFilter =
  | 'unassigned'
  | 'all'
  | 'payment'
  | 'expense'
  | 'payroll'
  | 'dividend'
  | 'sales_tax'
  | 'corporate_tax'
  | 'ignored'
type AssignKind = 'payment' | 'expense' | 'payroll' | 'dividend' | 'sales_tax' | 'corporate_tax'

const ASSIGN_KINDS: { id: AssignKind; label: string; outflow: boolean }[] = [
  { id: 'payment', label: 'Paiement client', outflow: false },
  { id: 'expense', label: 'Dépense', outflow: true },
  { id: 'payroll', label: 'Paie', outflow: true },
  { id: 'dividend', label: 'Dividende', outflow: true },
  { id: 'sales_tax', label: 'TPS / TVQ', outflow: true },
  { id: 'corporate_tax', label: 'Impôt société', outflow: true },
]

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
  const [payrollRuns, setPayrollRuns] = useState<BankPayrollRun[]>([])
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [salesTaxPeriods, setSalesTaxPeriods] = useState<SalesTaxPeriod[]>([])
  const [corpTaxRecords, setCorpTaxRecords] = useState<CorporateTaxRecord[]>([])

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

  const [payrollForm, setPayrollForm] = useState({
    payroll_run_id: '',
    kind: 'net_pay' as PayrollBankMatchKind,
    remittance_date: '',
    remittance_reference: '',
  })

  const [dividendForm, setDividendForm] = useState({ dividend_id: '' })

  const [salesTaxForm, setSalesTaxForm] = useState({ period_id: '', payment_date: '' })

  const [corpTaxForm, setCorpTaxForm] = useState({
    record_id: '',
    paid_amount: 0,
    paid_date: '',
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [bank, inv, pay, exp, part, set, payroll, div, corpTax, salesTax] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('invoices').select('*, partners(legal_name)').neq('status', 'void').order('invoice_date', { ascending: false }),
      supabase.from('payments').select('*, invoices(invoice_number, total, partner_id)'),
      supabase.from('expenses').select('*'),
      supabase.from('partners').select('*').order('legal_name'),
      supabase.from('organization_settings').select('*').maybeSingle(),
      supabase
        .from('payroll_runs')
        .select(
          'id, payment_date, pay_period_start, pay_period_end, net_pay, remittance_status, remittance_date, remittance_reference, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, employees(first_name, last_name)'
        )
        .order('payment_date', { ascending: false }),
      supabase.from('dividends').select('id, declared_date, payment_date, total_amount, paid_amount, description, status').order('declared_date', { ascending: false }),
      supabase.from('corporate_tax_records').select('*').order('due_date', { ascending: true }),
      supabase.from('sales_tax_periods').select('*').order('period_end', { ascending: false }),
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
    setPayrollRuns((payroll.data ?? []) as BankPayrollRun[])
    setDividends((div.data as Dividend[]) ?? [])
    setSalesTaxPeriods((salesTax.data as SalesTaxPeriod[]) ?? [])
    setCorpTaxRecords((corpTax.data as CorporateTaxRecord[]) ?? [])

    const fin = buildFinancialSnapshot(
      {
        payments: payments.map((p) => ({ amount: p.amount, payment_date: p.payment_date })),
        expenses: expenses,
        payrollRuns: payroll.data ?? [],
        invoices: [],
        invoicePaidMap: {},
        dividends: div.data ?? [],
        corporateTax: corpTax.data ?? [],
        salesTaxRemitted: (salesTax.data ?? []).filter((p) => p.status === 'paid'),
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
      setImportMsg(bankImportSetupHint(errorMessage(e, 'Erreur import')))
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
    const outflow = Number(tx.amount) < 0
    const kind: AssignKind = outflow ? 'expense' : 'payment'
    setAssignKind(kind)
    const absAmount = round2(Math.abs(Number(tx.amount)))

    if (!outflow) {
      const defaultInv = invoices.find((i) => i.balance > 0)
      setPayForm({
        invoice_id: defaultInv?.id ?? '',
        payment_date: tx.transaction_date,
        amount: absAmount,
        method: inferPaymentMethod(tx.description),
        reference: tx.description.slice(0, 120),
      })
    } else {
      const taxes = recalcExpenseTaxes(absAmount, true)
      setExpForm({
        expense_date: tx.transaction_date,
        partner_id: '',
        vendor: '',
        category: 'other',
        description: tx.description,
        total: absAmount,
        amount: taxes.amount,
        gst: taxes.gst,
        qst: taxes.qst,
        applyTax: true,
      })

      const defaultPayroll = payrollRuns[0]
      setPayrollForm({
        payroll_run_id: defaultPayroll?.id ?? '',
        kind: defaultPayroll?.remittance_status === 'remitted' ? 'net_pay' : 'net_pay',
        remittance_date: tx.transaction_date,
        remittance_reference: tx.description.slice(0, 120),
      })

      setDividendForm({ dividend_id: declaredDividends[0]?.id ?? '' })

      const openPeriod = salesTaxPeriods.find((p) => p.status !== 'paid') ?? salesTaxPeriods[0]
      setSalesTaxForm({
        period_id: openPeriod?.id ?? '',
        payment_date: tx.transaction_date,
      })

      const dueRecord = corpTaxRecords.find((r) => r.status !== 'paid') ?? corpTaxRecords[0]
      setCorpTaxForm({
        record_id: dueRecord?.id ?? '',
        paid_amount: absAmount,
        paid_date: tx.transaction_date,
      })
    }
    setAssignOpen(true)
  }

  function onExpenseTotalChange(total: number) {
    const taxes = recalcExpenseTaxes(total, expForm.applyTax)
    setExpForm({ ...expForm, ...taxes })
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
      } else if (assignKind === 'expense') {
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
      } else if (assignKind === 'payroll') {
        if (!payrollForm.payroll_run_id) {
          alert('Sélectionnez une paie.')
          return
        }
        await assignBankPayroll(
          assignTx.id,
          payrollForm.payroll_run_id,
          payrollForm.kind,
          payrollForm.remittance_date,
          payrollForm.remittance_reference || null
        )
      } else if (assignKind === 'dividend') {
        if (!dividendForm.dividend_id) {
          alert('Sélectionnez un dividende.')
          return
        }
        await assignBankDividend(
          assignTx.id,
          dividendForm.dividend_id,
          assignTx.transaction_date,
          round2(Math.abs(Number(assignTx.amount)))
        )
      } else if (assignKind === 'sales_tax') {
        if (!salesTaxForm.period_id) {
          alert('Sélectionnez une période TPS/TVQ.')
          return
        }
        await assignBankSalesTax(assignTx.id, salesTaxForm.period_id, salesTaxForm.payment_date)
      } else if (assignKind === 'corporate_tax') {
        if (!corpTaxForm.record_id) {
          alert('Sélectionnez un impôt société.')
          return
        }
        await assignBankCorporateTax(
          assignTx.id,
          corpTaxForm.record_id,
          corpTaxForm.paid_amount,
          corpTaxForm.paid_date
        )
      }
      setAssignOpen(false)
      setAssignTx(null)
      load()
    } catch (err) {
      alert(errorMessage(err, 'Erreur'))
    }
  }

  async function handleIgnore(tx: BankTransaction) {
    if (!confirm('Ignorer cette transaction (virement interne, doublon, etc.) ?')) return
    await ignoreBankTransaction(tx.id)
    load()
  }

  async function handleUnassign(tx: BankTransaction) {
    if (!confirm('Retirer l\'affectation ? Les enregistrements liés seront annulés ou supprimés selon le type.')) return
    try {
      await unassignBankTransaction(tx.id, tx.match_source, tx.match_id)
      load()
    } catch (err) {
      alert(errorMessage(err, 'Erreur'))
    }
  }

  async function handleDelete(tx: BankTransaction) {
    if (!confirm('Supprimer cette transaction bancaire ?')) return
    try {
      await deleteBankTransaction(tx.id, tx.match_source, tx.match_id)
      load()
    } catch (err) {
      alert(errorMessage(err, 'Erreur'))
    }
  }

  const payrollMap = useMemo(() => Object.fromEntries(payrollRuns.map((p) => [p.id, p])), [payrollRuns])
  const dividendMap = useMemo(() => Object.fromEntries(dividends.map((d) => [d.id, d])), [dividends])
  const declaredDividends = useMemo(() => dividends.filter((d) => d.status === 'declared'), [dividends])
  const salesTaxMap = useMemo(() => Object.fromEntries(salesTaxPeriods.map((p) => [p.id, p])), [salesTaxPeriods])
  const corpTaxMap = useMemo(() => Object.fromEntries(corpTaxRecords.map((r) => [r.id, r])), [corpTaxRecords])

  const selectedPayroll = payrollMap[payrollForm.payroll_run_id]
  const selectedDividend = dividendMap[dividendForm.dividend_id]
  const selectedSalesTax = salesTaxMap[salesTaxForm.period_id]
  const selectedCorpTax = corpTaxMap[corpTaxForm.record_id]

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
    if (tx.match_source === 'payroll' && tx.match_id) {
      const pr = payrollMap[tx.match_id]
      const emp = relationOne(pr?.employees)
      const suffix = tx.notes === 'payroll_match:remittance' ? ' · remise' : ' · net'
      return pr
        ? `Paie${suffix} · ${formatDate(pr.payment_date)}${emp ? ` · ${employeeDisplayName(emp)}` : ''}`
        : 'Paie'
    }
    if (tx.match_source === 'dividend' && tx.match_id) {
      const d = dividendMap[tx.match_id]
      return d
        ? `Dividende · ${formatDate(d.payment_date ?? d.declared_date)} · ${formatCad(d.total_amount)}`
        : 'Dividende'
    }
    if (tx.match_source === 'sales_tax' && tx.match_id) {
      const p = salesTaxMap[tx.match_id]
      return p ? `TPS/TVQ · ${formatDate(p.period_start)} → ${formatDate(p.period_end)}` : 'TPS/TVQ'
    }
    if (tx.match_source === 'corporate_tax' && tx.match_id) {
      const r = corpTaxMap[tx.match_id]
      return r ? `Impôt · ${r.label || r.fiscal_year}` : 'Impôt société'
    }
    return tx.match_source
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (assignmentFilter === 'unassigned' && r.match_source) return false
      if (assignmentFilter === 'ignored' && r.match_source !== 'manual') return false
      if (
        assignmentFilter !== 'all' &&
        assignmentFilter !== 'unassigned' &&
        assignmentFilter !== 'ignored' &&
        r.match_source !== assignmentFilter
      ) {
        return false
      }
      return matchesSearch(search, r.description, r.transaction_code, r.amount, sourceLabel(r), matchLabel(r))
    })
  }, [
    rows,
    assignmentFilter,
    search,
    paymentMap,
    expenseMap,
    payrollMap,
    dividendMap,
    salesTaxMap,
    corpTaxMap,
  ])

  const outstanding = invoices.filter((i) => i.balance > 0)
  const vendors = providerPartners(partners)

  return (
    <PageShell>
      <PageHeader
        title="Banque"
        subtitle="Importez vos relevés Wealthsimple, puis affectez chaque ligne (facture, dépense, paie, dividende, taxes)."
        actions={
          <>
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
          </>
        }
      />

      {importMsg && <AlertBanner variant="success">{importMsg}</AlertBanner>}

      <MetricGrid cols={4}>
        <MetricCard label="Solde relevé (importé)" value={formatCad(bankBalance)} />
        <MetricCard label="Trésorerie comptable" value={formatCad(bookCash)} />
        <MetricCard
          label="Écart"
          value={formatCad(variance)}
          hint={Math.abs(variance) > 1 ? 'Vérifier les affectations' : undefined}
        />
        <MetricCard label="Non affectées" value={unassignedCount} />
      </MetricGrid>

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
            activeFilterCount={(assignmentFilter !== 'unassigned' ? 1 : 0) + (search ? 1 : 0)}
            clearVisible={assignmentFilter !== 'unassigned' || !!search}
            onClearFilters={() => {
              setAssignmentFilter('unassigned')
              setSearch('')
            }}
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
                { value: 'payroll', label: 'Paie' },
                { value: 'dividend', label: 'Dividendes' },
                { value: 'sales_tax', label: 'TPS / TVQ' },
                { value: 'corporate_tax', label: 'Impôts société' },
                { value: 'ignored', label: 'Ignorées' },
              ]}
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

        <div className="flex flex-wrap gap-2 mb-4">
          {ASSIGN_KINDS.map((k) => {
            const outflow = assignTx != null && Number(assignTx.amount) < 0
            const disabled = k.outflow ? !outflow : outflow
            return (
              <button
                key={k.id}
                type="button"
                className={`px-3 py-2 rounded-lg text-sm border ${assignKind === k.id ? 'bg-yuzu-light border-yuzu font-medium' : 'border-border'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => !disabled && setAssignKind(k.id)}
                disabled={disabled}
              >
                {k.label}
              </button>
            )
          })}
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
          ) : assignKind === 'expense' ? (
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
                  La catégorie « paie » est réservée aux ajustements — utilisez l&apos;onglet Paie pour les salaires.
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
          ) : assignKind === 'payroll' ? (
            <>
              {payrollRuns.length === 0 ? (
                <p className="text-sm text-amber-800">Aucune paie — enregistrez une paie d&apos;abord.</p>
              ) : (
                <>
                  <Field label="Paie *">
                    <select
                      className={inputClass}
                      required
                      value={payrollForm.payroll_run_id}
                      onChange={(e) => setPayrollForm({ ...payrollForm, payroll_run_id: e.target.value })}
                    >
                      {payrollRuns.map((p) => {
                        const emp = relationOne(p.employees)
                        return (
                          <option key={p.id} value={p.id}>
                            {formatDate(p.payment_date)} · {emp ? employeeDisplayName(emp) : 'Employé'} · net {formatCad(p.net_pay)}
                            {p.remittance_status === 'remitted' ? ' · remise OK' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </Field>
                  <Field label="Type d&apos;affectation *">
                    <select
                      className={inputClass}
                      value={payrollForm.kind}
                      onChange={(e) => setPayrollForm({ ...payrollForm, kind: e.target.value as PayrollBankMatchKind })}
                    >
                      <option value="net_pay">Salaire net versé</option>
                      <option value="remittance">Remise source deductions (RP/TPZ)</option>
                    </select>
                  </Field>
                  {selectedPayroll && (
                    <p className="text-xs text-muted bg-stone-50 border border-border rounded-lg px-3 py-2">
                      Net attendu : {formatCad(selectedPayroll.net_pay)} · Remise attendue :{' '}
                      {formatCad(payrollRemittancesTotal(selectedPayroll))}
                    </p>
                  )}
                  {payrollForm.kind === 'remittance' && (
                    <>
                      <Field label="Date de remise *">
                        <input
                          type="date"
                          className={inputClass}
                          required
                          value={payrollForm.remittance_date}
                          onChange={(e) => setPayrollForm({ ...payrollForm, remittance_date: e.target.value })}
                        />
                      </Field>
                      <Field label="Référence">
                        <input
                          className={inputClass}
                          value={payrollForm.remittance_reference}
                          onChange={(e) => setPayrollForm({ ...payrollForm, remittance_reference: e.target.value })}
                        />
                      </Field>
                    </>
                  )}
                </>
              )}
            </>
          ) : assignKind === 'dividend' ? (
            <>
              {declaredDividends.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Aucun dividende déclaré en attente — déclarez une distribution dans Rémunération d&apos;abord.
                </p>
              ) : (
                <>
                  <Field label="Dividende déclaré *">
                    <select
                      className={inputClass}
                      required
                      value={dividendForm.dividend_id}
                      onChange={(e) => setDividendForm({ dividend_id: e.target.value })}
                    >
                      {declaredDividends.map((d) => (
                        <option key={d.id} value={d.id}>
                          {formatDate(d.declared_date)} · {formatCad(d.total_amount)}
                          {Number(d.paid_amount) > 0 ? ` · payé ${formatCad(d.paid_amount)}` : ''}
                          {d.description ? ` · ${d.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedDividend && assignTx && (
                    <p className="text-xs text-muted">
                      Ligne bancaire {formatCad(Math.abs(Number(assignTx.amount)))} · solde à payer{' '}
                      {formatCad(Number(selectedDividend.total_amount) - Number(selectedDividend.paid_amount ?? 0))}
                      {Math.abs(Math.abs(Number(assignTx.amount)) - (Number(selectedDividend.total_amount) - Number(selectedDividend.paid_amount ?? 0))) >
                        0.01 && (
                        <span className="text-amber-800"> · paiement partiel ou écart de montant</span>
                      )}
                    </p>
                  )}
                </>
              )}
            </>
          ) : assignKind === 'sales_tax' ? (
            <>
              {salesTaxPeriods.length === 0 ? (
                <p className="text-sm text-amber-800">Aucune période TPS/TVQ — créez-en une dans Autre.</p>
              ) : (
                <>
                  <Field label="Période *">
                    <select
                      className={inputClass}
                      required
                      value={salesTaxForm.period_id}
                      onChange={(e) => setSalesTaxForm({ ...salesTaxForm, period_id: e.target.value })}
                    >
                      {salesTaxPeriods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatDate(p.period_start)} → {formatDate(p.period_end)} · net {formatCad(Number(p.gst_net) + Number(p.qst_net))} · {p.status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date de paiement *">
                    <input
                      type="date"
                      className={inputClass}
                      required
                      value={salesTaxForm.payment_date}
                      onChange={(e) => setSalesTaxForm({ ...salesTaxForm, payment_date: e.target.value })}
                    />
                  </Field>
                  {selectedSalesTax && (
                    <p className="text-xs text-muted">
                      TPS net {formatCad(selectedSalesTax.gst_net)} · TVQ net {formatCad(selectedSalesTax.qst_net)}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {corpTaxRecords.length === 0 ? (
                <p className="text-sm text-amber-800">Aucun impôt société — enregistrez T2/CO-17 dans Autre.</p>
              ) : (
                <>
                  <Field label="Enregistrement *">
                    <select
                      className={inputClass}
                      required
                      value={corpTaxForm.record_id}
                      onChange={(e) => {
                        const r = corpTaxRecords.find((x) => x.id === e.target.value)
                        const balance = r ? Number(r.amount) - Number(r.paid_amount) : 0
                        setCorpTaxForm({
                          ...corpTaxForm,
                          record_id: e.target.value,
                          paid_amount: balance > 0 ? round2(balance) : corpTaxForm.paid_amount,
                        })
                      }}
                    >
                      {corpTaxRecords.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.fiscal_year} · {r.label || r.tax_authority} · dû {formatCad(Number(r.amount) - Number(r.paid_amount))} · {r.status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Montant payé *">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={inputClass}
                        required
                        value={corpTaxForm.paid_amount}
                        onChange={(e) => setCorpTaxForm({ ...corpTaxForm, paid_amount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Date de paiement *">
                      <input
                        type="date"
                        className={inputClass}
                        required
                        value={corpTaxForm.paid_date}
                        onChange={(e) => setCorpTaxForm({ ...corpTaxForm, paid_date: e.target.value })}
                      />
                    </Field>
                  </div>
                  {selectedCorpTax && (
                    <p className="text-xs text-muted">
                      Provision totale {formatCad(selectedCorpTax.amount)} · déjà payé {formatCad(selectedCorpTax.paid_amount)}
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button
              type="submit"
              disabled={
                (assignKind === 'payment' && outstanding.length === 0) ||
                (assignKind === 'payroll' && payrollRuns.length === 0) ||
                (assignKind === 'dividend' && declaredDividends.length === 0) ||
                (assignKind === 'sales_tax' && salesTaxPeriods.length === 0) ||
                (assignKind === 'corporate_tax' && corpTaxRecords.length === 0)
              }
            >
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
