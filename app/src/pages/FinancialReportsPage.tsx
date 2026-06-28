import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'
import { periodPresets, type DateRange } from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'
import {
  BalanceSheetStatement,
  CashFlowStatement,
  IncomeStatement,
} from '../components/FinancialStatements'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { ViewToggle } from '../components/ListToolbar'
import {
  downloadAllFinancialReportsPdf,
  downloadFinancialReportPdf,
  type FinancialReportKind,
} from '../lib/financialReportPdf'

type ReportView = FinancialReportKind

export function FinancialReportsPage() {
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [view, setView] = useState<ReportView>('income')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (period) reloadFinancials(period)
  }, [period])

  async function load() {
    setLoading(true)
    const { data: settingsRow } = await supabase.from('organization_settings').select('*').maybeSingle()
    const orgSettings = settingsRow ?? null
    setSettings(orgSettings)
    const fyeMonth = Number(orgSettings?.fiscal_year_end_month ?? 6)
    const fyeDay = Number(orgSettings?.fiscal_year_end_day ?? 30)
    const ranges = periodPresets(fyeMonth, fyeDay)
    setPresets(ranges)
    const initial = ranges.find((r) => r.label.startsWith('AF')) ?? ranges[0]
    setPeriod(initial)
    await reloadFinancials(initial, orgSettings ?? undefined)
    setLoading(false)
  }

  async function reloadFinancials(range: DateRange, orgSettings?: OrganizationSettings) {
    const [settingsRow, payments, expenses, employeeExpenses, payroll, invoices, dividends, corpTax, salesTaxPaid, bank] =
      await Promise.all([
        orgSettings ? Promise.resolve({ data: orgSettings }) : supabase.from('organization_settings').select('*').maybeSingle(),
        supabase.from('payments').select('invoice_id, amount, payment_date'),
        supabase
          .from('expenses')
          .select('amount, total, paid, gst, qst, category, payroll_run_id, expense_date'),
        supabase
          .from('employee_expenses')
          .select('amount, total, gst, qst, category, taxable, payroll_run_id, expense_date'),
        supabase
          .from('payroll_runs')
          .select(
            'payment_date, remittance_status, remittance_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay, reimbursement_total'
          ),
        supabase.from('invoices').select('id, total, status, subtotal, gst, qst, invoice_date').neq('status', 'void'),
        supabase.from('dividends').select('total_amount, paid_amount, declared_date, payment_date, status'),
        supabase.from('corporate_tax_records').select('amount, paid_amount, status'),
        supabase.from('sales_tax_periods').select('gst_net, qst_net, filed_date, period_end').eq('status', 'paid'),
        supabase.from('bank_transactions').select('amount, transaction_date'),
      ])

    const paidMap: Record<string, number> = {}
    for (const p of payments.data ?? []) paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)

    setFin(
      buildFinancialSnapshot(
        {
          payments: payments.data ?? [],
          expenses: expenses.data ?? [],
          employeeExpenses: employeeExpenses.data ?? [],
          payrollRuns: payroll.data ?? [],
          invoices: (invoices.data ?? []) as {
            id: string
            total: number
            status: string
            subtotal: number
            gst: number
            qst: number
            invoice_date: string
          }[],
          invoicePaidMap: paidMap,
          dividends: dividends.data ?? [],
          corporateTax: corpTax.data ?? [],
          salesTaxRemitted: salesTaxPaid.data ?? [],
          bankTransactions: bank.data ?? [],
          settings: settingsRow.data ?? undefined,
        },
        range
      )
    )
  }

  if (loading || !fin || !period) return <div className="text-muted">Chargement…</div>

  const periodLabel = period.label

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Rapports financiers"
        subtitle="État des résultats, bilan et flux de trésorerie — brouillon pour révision CPA."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => downloadFinancialReportPdf(view, fin, settings)}>
              Télécharger PDF
            </Button>
            <Button type="button" variant="secondary" onClick={() => downloadAllFinancialReportsPdf(fin, settings)}>
              Tout en PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'income', label: 'État des résultats' },
            { value: 'balance-sheet', label: 'Bilan' },
            { value: 'cash-flow', label: 'Flux de trésorerie' },
          ]}
        />
        <select
          className="border border-border rounded-lg px-3 py-2 text-sm bg-white min-h-[44px]"
          value={presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end)}
          onChange={(e) => setPeriod(presets[Number(e.target.value)])}
        >
          {presets.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl p-5">
        {view === 'income' && <IncomeStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'balance-sheet' && <BalanceSheetStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'cash-flow' && <CashFlowStatement fin={fin} periodLabel={periodLabel} />}
      </div>
    </PageShell>
  )
}
