import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, relationOne } from '../lib/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'
import { buildMonthlySeries, hasChartData } from '../lib/dashboardSeries'
import { periodPresets, type DateRange } from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'
import { CapitalChart, CashFlowChart, RevenueTrendChart } from '../components/DashboardCharts'

function Card({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const inner = (
    <div className="bg-white border border-border rounded-xl p-5 h-full">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="hover:border-yuzu border border-transparent rounded-xl transition-colors block h-full">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export function DashboardPage() {
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [ops, setOps] = useState({ partners: 0, unbilledHours: 0, unbilledAmount: 0, pendingReimbursement: 0 })
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [chartSource, setChartSource] = useState<Parameters<typeof buildMonthlySeries>[0] | null>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (period) reloadFinancials(period)
  }, [period])

  async function load() {
    const { data: settingsRow } = await supabase.from('organization_settings').select('*').maybeSingle()
    const orgSettings = settingsRow ?? null
    setSettings(orgSettings)
    const fyeMonth = Number(orgSettings?.fiscal_year_end_month ?? 6)
    const fyeDay = Number(orgSettings?.fiscal_year_end_day ?? 30)
    const ranges = periodPresets(fyeMonth, fyeDay)
    setPresets(ranges)
    const initial = ranges.find((r) => r.label.startsWith('AF')) ?? ranges[0]
    setPeriod(initial)
    await Promise.all([reloadFinancials(initial, orgSettings ?? undefined), loadChartSource(orgSettings ?? undefined), loadOps()])
  }

  async function loadChartSource(orgSettings?: OrganizationSettings) {
    const [payments, expenses, payroll, invoices, dividends, corpTax, salesTaxPaid] = await Promise.all([
      supabase.from('payments').select('amount, payment_date'),
      supabase.from('expenses').select('amount, total, paid, category, payroll_run_id, expense_date'),
      supabase
        .from('payroll_runs')
        .select(
          'payment_date, remittance_status, remittance_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay'
        ),
      supabase.from('invoices').select('subtotal, invoice_date, status').neq('status', 'void'),
      supabase.from('dividends').select('total_amount, paid_amount, declared_date, payment_date, status'),
      supabase.from('corporate_tax_records').select('paid_amount, paid_date'),
      supabase.from('sales_tax_periods').select('gst_net, qst_net, filed_date, period_end').eq('status', 'paid'),
    ])

    setChartSource({
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      payrollRuns: payroll.data ?? [],
      invoices: invoices.data ?? [],
      dividends: dividends.data ?? [],
      corporateTax: corpTax.data ?? [],
      salesTaxRemitted: salesTaxPaid.data ?? [],
      settings: orgSettings ?? undefined,
    })
  }

  async function loadOps() {
    const [partners, entries, employeeExpenses] = await Promise.all([
      supabase.from('partners').select('id', { count: 'exact', head: true }),
      supabase
        .from('time_entries')
        .select('hours, rate_override, billable, invoice_id, projects(default_hourly_rate)')
        .is('invoice_id', null)
        .eq('billable', true),
      supabase.from('employee_expenses').select('total, payroll_run_id').is('payroll_run_id', null),
    ])

    let unbilledHours = 0
    let unbilledAmount = 0
    for (const e of entries.data ?? []) {
      const p = relationOne<{ default_hourly_rate: number }>(e.projects)
      if (!p) continue
      const rate = e.rate_override ?? p.default_hourly_rate
      unbilledHours += Number(e.hours)
      unbilledAmount += Number(e.hours) * Number(rate)
    }

    const pendingReimbursement = (employeeExpenses.data ?? []).reduce((s, e) => s + Number(e.total), 0)

    setOps({
      partners: partners.count ?? 0,
      unbilledHours: Math.round(unbilledHours * 10) / 10,
      unbilledAmount,
      pendingReimbursement,
    })
  }

  async function reloadFinancials(range: DateRange, settings?: OrganizationSettings) {
    const [settingsRow, payments, expenses, employeeExpenses, payroll, invoices, dividends, corpTax, salesTaxPaid, bank] =
      await Promise.all([
        settings ? Promise.resolve({ data: settings }) : supabase.from('organization_settings').select('*').maybeSingle(),
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

  const monthlySeries = useMemo(() => {
    if (!chartSource || !period) return []
    return buildMonthlySeries(chartSource, period)
  }, [chartSource, period])

  if (!fin || !period) return <div className="text-muted">Chargement…</div>

  const eq = fin.balanceSheet.equity

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">Tableau de bord</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <Link to="/financial-reports" className="text-sm text-yuzu-dark hover:underline font-medium">
            Rapports financiers →
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Opérations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Partenaires" value={String(ops.partners)} to="/partners" />
          <Card label="Heures non facturées" value={`${ops.unbilledHours} h`} to="/billing/time" />
          <Card label="À facturer" value={formatCad(ops.unbilledAmount)} to="/billing/invoices" />
          <Card label="À rembourser" value={formatCad(ops.pendingReimbursement)} to="/employee-expenses" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Tendances — {period.label}</h2>
        {hasChartData(monthlySeries) ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <RevenueTrendChart points={monthlySeries} />
            <CashFlowChart points={monthlySeries} />
            <CapitalChart
              points={monthlySeries}
              equity={eq}
              openingCash={Number(settings?.opening_cash_balance ?? 0)}
            />
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted">
            Les graphiques apparaîtront lorsque vous aurez des factures, paiements ou mouvements sur la période sélectionnée.
          </div>
        )}
      </section>
    </div>
  )
}
