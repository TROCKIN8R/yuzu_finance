import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'
import { buildMonthlySeries, hasChartData } from '../lib/dashboardSeries'
import { computeUnbilledWip } from '../lib/billingMetrics'
import {
  averageRate,
  buildServiceKpiTrends,
  computeWorkedRevenueMetrics,
  operatingMarginPct,
} from '../lib/dashboardKpis'
import { fetchDashboardBillingData } from '../lib/dashboardData'
import { useDashboardPeriod } from '../hooks/useDashboardPeriod'
import type { OrganizationSettings } from '../lib/types'
import {
  CapitalChart,
  CashFlowChart,
  PayrollTrendChart,
  ProfitabilityChart,
  RevenueTrendChart,
} from '../components/DashboardCharts'
import { DashboardSection, KpiCard, MetricGrid } from '../components/MetricCard'

export function DashboardDetailsPage() {
  const { period, setPeriod, presets, settings, ready } = useDashboardPeriod()
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [ops, setOps] = useState({ partners: 0, unbilledHours: 0, unbilledAmount: 0, pendingReimbursement: 0 })
  const [worked, setWorked] = useState({ total: 0, hourly: 0, fixed: 0, hours: 0, hourlyHours: 0, fixedHours: 0 })
  const [chartSource, setChartSource] = useState<Parameters<typeof buildMonthlySeries>[0] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (period) loadAll(period, settings ?? undefined)
  }, [period, settings])

  async function loadAll(range: NonNullable<typeof period>, orgSettings?: OrganizationSettings) {
    setLoading(true)
    const billing = await fetchDashboardBillingData()

    const [settingsRow, payments, expenses, employeeExpenses, payroll, invoices, dividends, corpTax, salesTaxPaid, bank, partners, employeeExpensesPending] =
      await Promise.all([
        orgSettings ? Promise.resolve({ data: orgSettings }) : supabase.from('organization_settings').select('*').maybeSingle(),
        supabase.from('payments').select('invoice_id, amount, payment_date'),
        supabase.from('expenses').select('amount, total, paid, gst, qst, category, payroll_run_id, expense_date'),
        supabase.from('employee_expenses').select('amount, total, gst, qst, category, taxable, payroll_run_id, expense_date'),
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
        supabase.from('partners').select('id', { count: 'exact', head: true }),
        supabase.from('employee_expenses').select('total, payroll_run_id').is('payroll_run_id', null),
      ])

    const paidMap: Record<string, number> = {}
    for (const p of payments.data ?? []) paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)

    const wip = computeUnbilledWip(billing.timeEntries, billing.fixedProjects)
    const workedMetrics = computeWorkedRevenueMetrics(billing.timeEntries, range)

    setWorked(workedMetrics)
    setOps({
      partners: partners.count ?? 0,
      unbilledHours: wip.hours,
      unbilledAmount: wip.amount,
      pendingReimbursement: (employeeExpensesPending.data ?? []).reduce((s, e) => s + Number(e.total), 0),
    })

    setChartSource({
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      payrollRuns: payroll.data ?? [],
      invoices: invoices.data ?? [],
      timeEntries: billing.timeEntries,
      dividends: dividends.data ?? [],
      corporateTax: corpTax.data ?? [],
      salesTaxRemitted: salesTaxPaid.data ?? [],
      settings: settingsRow.data ?? undefined,
    })

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
    setLoading(false)
  }

  const monthlySeries = useMemo(() => {
    if (!chartSource || !period) return []
    return buildMonthlySeries(chartSource, period)
  }, [chartSource, period])

  const trends = useMemo(() => buildServiceKpiTrends(monthlySeries), [monthlySeries])

  if (!ready || !period || loading || !fin) return <div className="text-muted">Chargement…</div>

  const eq = fin.balanceSheet.equity
  const invoicedRevenue = fin.income.revenueSubtotal
  const billingGap = Math.round((worked.total - invoicedRevenue) * 100) / 100
  const margin = operatingMarginPct(invoicedRevenue, fin.income.operatingIncome)
  const periodNetCash = fin.cashIn - fin.cashOut
  const hourlyAvg = averageRate(worked.hourly, worked.hourlyHours)
  const fixedAvg = averageRate(worked.fixed, worked.fixedHours)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Tableau de bord — détails</h1>
          <p className="text-sm text-muted mt-0.5">Indicateurs complets — {period.label}</p>
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
          <Link to="/" className="text-sm font-medium px-3 py-2 rounded-lg border border-border bg-white hover:border-yuzu/50">
            ← Vue exécutive
          </Link>
          <Link to="/financial-reports" className="text-sm text-yuzu-dark hover:underline font-medium">
            Rapports financiers →
          </Link>
        </div>
      </div>

      <DashboardSection title="Revenus et prestations">
        <MetricGrid cols={4}>
          <KpiCard
            label="Prestations réalisées"
            value={formatCad(worked.total)}
            sub={`${worked.hours} h · horaire ${formatCad(worked.hourly)} · forfait ${formatCad(worked.fixed)}`}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <KpiCard label="$/h moyen — Horaire" value={hourlyAvg != null ? `${formatCad(hourlyAvg)}/h` : '—'} sub={`${worked.hourlyHours} h sur la période`} />
          <KpiCard label="$/h moyen — Forfait (interne)" value={fixedAvg != null ? `${formatCad(fixedAvg)}/h` : '—'} sub={`${worked.fixedHours} h internes · prorata forfait`} />
        </div>
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
          <KpiCard label="Marge d'exploitation" value={margin != null ? `${margin.toFixed(1)} %` : '—'} sub="Résultat / revenus facturés" />
          <KpiCard label="Dépenses d'exploitation" value={formatCad(fin.income.operatingExpenses)} sub="Hors paie" to="/expenses" />
          <KpiCard label="Comptes à recevoir" value={formatCad(fin.accountsReceivable)} sub="Factures impayées (période)" to="/billing/invoices" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Paie et charges">
        <MetricGrid cols={4}>
          <KpiCard label="Salaire brut" value={formatCad(fin.income.payrollGross)} sub="Rémunération sur la période" to="/payroll" />
          <KpiCard label="Charges patronales" value={formatCad(fin.income.employerPayrollContributions)} sub="CPP, AE, QPIP, avantages" to="/payroll" />
          <KpiCard label="Coût total de la paie" value={formatCad(fin.payrollYtd)} sub="Brut + charges patronales" trend={trends.payrollTotal} to="/payroll" />
          <KpiCard label="Remises en attente" value={formatCad(fin.balanceSheet.payrollRemittancesPending)} sub="Retenues et cotisations à remettre" to="/payroll" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Trésorerie">
        <MetricGrid cols={4}>
          <KpiCard label="Trésorerie (livre)" value={formatCad(fin.balanceSheet.cash)} sub="Solde estimé cumulatif" to="/bank" />
          <KpiCard label="Flux net (période)" value={formatCad(periodNetCash)} sub={`Entrées ${formatCad(fin.cashIn)} · Sorties ${formatCad(fin.cashOut)}`} />
          <KpiCard label="Avoir total" value={formatCad(fin.equity)} sub="Capital-actions + BNR estimés" to="/financial-reports" />
          <KpiCard label="Taxes de vente à payer" value={formatCad(fin.salesTaxPayable)} sub="TPS + TVQ nettes" to="/sales-tax" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title="Pipeline de facturation">
        <MetricGrid cols={4}>
          <KpiCard label="Partenaires actifs" value={String(ops.partners)} to="/partners" />
          <KpiCard label="Heures non facturées" value={`${ops.unbilledHours} h`} sub="Temps horaire pas encore sur facture" to="/billing/time" />
          <KpiCard label="WIP à facturer" value={formatCad(ops.unbilledAmount)} sub="Horaire + forfaits non facturés" to="/billing/invoices" />
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
              <CapitalChart points={monthlySeries} equity={eq} openingCash={Number(settings?.opening_cash_balance ?? 0)} />
            </div>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted">
            Les graphiques apparaîtront lorsque vous aurez des prestations, factures, paie ou mouvements sur la période sélectionnée.
          </div>
        )}
      </DashboardSection>

      <p className="text-xs text-muted pb-2">
        Brouillon pour révision — les forfaits non facturés sont inclus au WIP; le temps forfaitaire est interne et proratisé aux prestations.
      </p>
    </div>
  )
}
