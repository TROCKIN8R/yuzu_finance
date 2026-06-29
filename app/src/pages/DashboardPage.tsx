import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, relationOne } from '../lib/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'
import { buildMonthlySeries, hasChartData } from '../lib/dashboardSeries'
import {
  buildServiceKpiTrends,
  computeWorkedHours,
  computeWorkedRevenue,
  operatingMarginPct,
} from '../lib/dashboardKpis'
import { periodPresets, type DateRange } from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'
import {
  CapitalChart,
  CashFlowChart,
  PayrollTrendChart,
  ProfitabilityChart,
  RevenueTrendChart,
} from '../components/DashboardCharts'
import { DashboardSection, KpiCard, MetricGrid } from '../components/MetricCard'

export function DashboardPage() {
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [ops, setOps] = useState({ partners: 0, unbilledHours: 0, unbilledAmount: 0, pendingReimbursement: 0 })
  const [workedRevenue, setWorkedRevenue] = useState(0)
  const [workedHours, setWorkedHours] = useState(0)
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
    await Promise.all([
      reloadFinancials(initial, orgSettings ?? undefined),
      loadChartSource(orgSettings ?? undefined),
      loadOps(),
    ])
  }

  async function loadChartSource(orgSettings?: OrganizationSettings) {
    const [payments, expenses, payroll, invoices, dividends, corpTax, salesTaxPaid, timeEntries] = await Promise.all([
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
      supabase
        .from('time_entries')
        .select('entry_date, hours, rate_override, billable, projects(default_hourly_rate)'),
    ])

    const entries = timeEntries.data ?? []
    setChartSource({
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      payrollRuns: payroll.data ?? [],
      invoices: invoices.data ?? [],
      timeEntries: entries,
      dividends: dividends.data ?? [],
      corporateTax: corpTax.data ?? [],
      salesTaxRemitted: salesTaxPaid.data ?? [],
      settings: orgSettings ?? undefined,
    })

    if (period) {
      setWorkedRevenue(computeWorkedRevenue(entries, period))
      setWorkedHours(computeWorkedHours(entries, period))
    }
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

  async function reloadFinancials(range: DateRange, orgSettings?: OrganizationSettings) {
    const [settingsRow, payments, expenses, employeeExpenses, payroll, invoices, dividends, corpTax, salesTaxPaid, bank, timeEntries] =
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
        supabase
          .from('time_entries')
          .select('entry_date, hours, rate_override, billable, projects(default_hourly_rate)'),
      ])

    const paidMap: Record<string, number> = {}
    for (const p of payments.data ?? []) paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)

    const entries = timeEntries.data ?? []
    setWorkedRevenue(computeWorkedRevenue(entries, range))
    setWorkedHours(computeWorkedHours(entries, range))

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

  const trends = useMemo(() => buildServiceKpiTrends(monthlySeries), [monthlySeries])

  if (!fin || !period) return <div className="text-muted">Chargement…</div>

  const eq = fin.balanceSheet.equity
  const invoicedRevenue = fin.income.revenueSubtotal
  const billingGap = Math.round((workedRevenue - invoicedRevenue) * 100) / 100
  const margin = operatingMarginPct(invoicedRevenue, fin.income.operatingIncome)
  const periodNetCash = fin.cashIn - fin.cashOut

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-muted mt-0.5">Indicateurs clés — {period.label}</p>
        </div>
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

      <DashboardSection title="Revenus et prestations">
        <MetricGrid cols={4}>
          <KpiCard
            label="Prestations réalisées"
            value={formatCad(workedRevenue)}
            sub={`${workedHours} h facturables`}
            trend={trends.workedRevenue}
            to="/billing/time"
          />
          <KpiCard
            label="Revenus facturés"
            value={formatCad(invoicedRevenue)}
            sub="Montants HT sur la période"
            trend={trends.invoicedRevenue}
            to="/billing/invoices"
          />
          <KpiCard
            label="Encaissements"
            value={formatCad(fin.cashIn)}
            sub="Paiements clients reçus"
            trend={trends.cashCollected}
            to="/billing/invoices"
          />
          <KpiCard
            label="Écart prestations / facturation"
            value={formatCad(billingGap)}
            sub={billingGap > 0 ? 'Travail non encore facturé (période)' : billingGap < 0 ? 'Facturé au-delà du temps saisi' : 'Aligné'}
            to="/billing/invoices"
          />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Rentabilité">
        <MetricGrid cols={4}>
          <KpiCard
            label="Résultat d'exploitation"
            value={formatCad(fin.income.operatingIncome)}
            sub="Revenus − dépenses − paie (charges incl.)"
            trend={trends.operatingIncome}
            to="/financial-reports"
          />
          <KpiCard
            label="Marge d'exploitation"
            value={margin != null ? `${margin.toFixed(1)} %` : '—'}
            sub="Résultat / revenus facturés"
          />
          <KpiCard
            label="Dépenses d'exploitation"
            value={formatCad(fin.income.operatingExpenses)}
            sub="Hors paie"
            to="/expenses"
          />
          <KpiCard
            label="Comptes à recevoir"
            value={formatCad(fin.accountsReceivable)}
            sub="Factures impayées (période)"
            to="/billing/invoices"
          />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Paie et charges">
        <MetricGrid cols={4}>
          <KpiCard
            label="Salaire brut"
            value={formatCad(fin.income.payrollGross)}
            sub="Rémunération sur la période"
            to="/payroll"
          />
          <KpiCard
            label="Charges patronales"
            value={formatCad(fin.income.employerPayrollContributions)}
            sub="CPP, AE, QPIP, avantages"
            to="/payroll"
          />
          <KpiCard
            label="Coût total de la paie"
            value={formatCad(fin.payrollYtd)}
            sub="Brut + charges patronales"
            trend={trends.payrollTotal}
            to="/payroll"
          />
          <KpiCard
            label="Remises en attente"
            value={formatCad(fin.balanceSheet.payrollRemittancesPending)}
            sub="Retenues et cotisations à remettre"
            to="/payroll"
          />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Trésorerie">
        <MetricGrid cols={4}>
          <KpiCard label="Trésorerie (livre)" value={formatCad(fin.balanceSheet.cash)} sub="Solde estimé cumulatif" to="/bank" />
          <KpiCard
            label="Flux net (période)"
            value={formatCad(periodNetCash)}
            sub={`Entrées ${formatCad(fin.cashIn)} · Sorties ${formatCad(fin.cashOut)}`}
          />
          <KpiCard label="Avoir total" value={formatCad(fin.equity)} sub="Capital-actions + BNR estimés" to="/financial-reports" />
          <KpiCard
            label="Taxes de vente à payer"
            value={formatCad(fin.salesTaxPayable)}
            sub="TPS + TVQ nettes"
            to="/sales-tax"
          />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Pipeline de facturation">
        <MetricGrid cols={4}>
          <KpiCard label="Partenaires actifs" value={String(ops.partners)} to="/partners" />
          <KpiCard label="Heures non facturées" value={`${ops.unbilledHours} h`} sub="Temps saisi, pas encore sur facture" to="/billing/time" />
          <KpiCard label="WIP à facturer" value={formatCad(ops.unbilledAmount)} sub="Valeur du temps non facturé" to="/billing/invoices" />
          <KpiCard label="Remboursements en attente" value={formatCad(ops.pendingReimbursement)} to="/employee-expenses" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title={`Tendances — ${period.label}`}>
        {hasChartData(monthlySeries) ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <RevenueTrendChart points={monthlySeries} />
            <ProfitabilityChart points={monthlySeries} />
            <CashFlowChart points={monthlySeries} />
            <PayrollTrendChart points={monthlySeries} />
            <div className="xl:col-span-2">
              <CapitalChart
                points={monthlySeries}
                equity={eq}
                openingCash={Number(settings?.opening_cash_balance ?? 0)}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted">
            Les graphiques apparaîtront lorsque vous aurez des prestations, factures, paie ou mouvements sur la période sélectionnée.
          </div>
        )}
      </DashboardSection>

      <p className="text-xs text-muted pb-2">
        Brouillon pour révision — les tendances M/M comparent les deux derniers mois de la série. Les montants de paie incluent les charges patronales au coût d&apos;exploitation.
      </p>
    </div>
  )
}
