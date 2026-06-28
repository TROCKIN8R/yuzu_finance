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

function StmtRow({
  label,
  value,
  bold,
  indent,
  negative,
}: {
  label: string
  value: string
  bold?: boolean
  indent?: boolean
  negative?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 py-2 border-b border-border text-sm ${bold ? 'font-semibold' : ''} ${indent ? 'pl-4' : ''}`}
    >
      <span className={bold ? 'text-ink' : 'text-muted'}>{label}</span>
      <span className={`shrink-0 ${negative ? 'text-red-700' : ''}`}>{value}</span>
    </div>
  )
}

function StmtSection({ title }: { title: string }) {
  return <p className="text-xs text-muted mb-2 mt-4 first:mt-0 uppercase tracking-wide font-medium">{title}</p>
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
      supabase.from('dividends').select('total_amount, payment_date'),
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
        supabase.from('dividends').select('total_amount, payment_date'),
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

  const cf = fin.cashFlow
  const bs = fin.balanceSheet
  const inc = fin.income
  const eq = bs.equity

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
          <Link to="/ledger" className="text-sm text-yuzu-dark hover:underline font-medium">
            Grand livre →
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Opérations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Partenaires" value={String(ops.partners)} to="/partners" />
          <Card label="Heures non facturées" value={`${ops.unbilledHours} h`} to="/time" />
          <Card label="À facturer" value={formatCad(ops.unbilledAmount)} to="/invoices" />
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

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Flux de trésorerie — {period.label}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Card label="Encaissements" value={formatCad(fin.cashIn)} sub="Paiements clients" to="/bank" />
          <Card label="Décaissements" value={formatCad(fin.cashOut)} sub="Voir détail ci-dessous" />
          <Card
            label="Trésorerie nette estimée"
            value={formatCad(fin.netCash)}
            sub={fin.netCash >= 0 ? 'Solde positif' : 'Solde négatif'}
            to="/bank"
          />
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <StmtSection title="Encaissements" />
          <StmtRow label="Paiements clients reçus" value={formatCad(cf.clientPayments)} />

          <StmtSection title="Décaissements" />
          <StmtRow label="Dépenses payées (TTC)" value={formatCad(cf.expensesPaid)} indent negative />
          <StmtRow label="Salaire net versé aux employés" value={formatCad(cf.payrollNetToEmployee)} indent negative />
          <StmtRow label="Remises paie (retenues + cotisations)" value={formatCad(cf.payrollRemittancesPaid)} indent negative />
          <StmtRow label="Cotisations employeur (cash)" value={formatCad(cf.employerPayrollContributions)} indent negative />
          <StmtRow label="Remises TPS/TVQ" value={formatCad(cf.salesTaxRemitted)} indent negative />
          <StmtRow label="Impôts société payés" value={formatCad(cf.corporateTaxPaid)} indent negative />
          <StmtRow label="Dividendes distribués" value={formatCad(cf.dividendsPaid)} indent negative />
          <StmtRow label="Total décaissements" value={formatCad(fin.cashOut)} bold negative />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Bilan simplifié</h2>
          <p className="text-xs text-muted mb-4">{period.label}</p>

          <StmtSection title="Actif" />
          <StmtRow label="Trésorerie comptable" value={formatCad(bs.cash)} />
          {bs.bankStatementBalance != null && (
            <StmtRow label="Solde relevé bancaire" value={formatCad(bs.bankStatementBalance)} indent />
          )}
          <StmtRow label="Comptes clients (CC)" value={formatCad(bs.accountsReceivable)} />
          <StmtRow label="TPS à recevoir (CTI)" value={formatCad(bs.gstReceivable)} indent />
          <StmtRow label="TVQ à recevoir (RTI)" value={formatCad(bs.qstReceivable)} indent />
          <StmtRow label="Total actif" value={formatCad(bs.totalAssets)} bold />

          <StmtSection title="Passif" />
          <StmtRow label="Comptes fournisseurs" value={formatCad(bs.accountsPayable)} />
          {bs.employeeReimbursementsPending > 0 && (
            <StmtRow label="Remboursements employé dus" value={formatCad(bs.employeeReimbursementsPending)} indent />
          )}
          <StmtRow label="TPS à remettre" value={formatCad(bs.gstPayable)} indent />
          <StmtRow label="TVQ à remettre" value={formatCad(bs.qstPayable)} indent />
          <StmtRow label="Remises paie en attente" value={formatCad(bs.payrollRemittancesPending)} />
          <StmtRow label="Impôts société dus" value={formatCad(bs.corporateTaxDue)} />
          <StmtRow label="Provision impôt société" value={formatCad(bs.corpTaxProvision)} indent />
          <StmtRow label="Total passif" value={formatCad(bs.totalLiabilities)} bold />

          <StmtSection title="Avoir" />
          <StmtRow label="Capital-actions" value={formatCad(eq.shareCapital)} indent />
          <StmtRow label="BNR d'ouverture" value={formatCad(eq.openingRetainedEarnings)} indent />
          <StmtRow label="Résultat de la période" value={formatCad(eq.operatingIncome)} indent />
          <StmtRow label="Dividendes (période)" value={formatCad(eq.dividendsDistributed)} indent negative />
          <StmtRow label="BNR cumulé" value={formatCad(eq.retainedEarnings)} indent />
          <StmtRow label="Total avoir" value={formatCad(eq.totalEquity)} bold />
        </section>

        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">État des résultats</h2>
          <p className="text-xs text-muted mb-4">{period.label} — revenus HT, dépenses HT, paie employeur</p>

          <StmtSection title="Revenus" />
          <StmtRow label="Revenus de services (HT)" value={formatCad(inc.revenueSubtotal)} />

          <StmtSection title="Charges d'exploitation" />
          <StmtRow label="Dépenses d'exploitation (HT)" value={formatCad(inc.operatingExpenses)} indent negative />
          <StmtRow label="Salaires bruts" value={formatCad(inc.payrollGross)} indent negative />
          <StmtRow label="Cotisations employeur" value={formatCad(inc.employerPayrollContributions)} indent negative />
          <StmtRow label="Résultat d'exploitation" value={formatCad(inc.operatingIncome)} bold />

          <StmtSection title="Distributions (avoir)" />
          <StmtRow label="Dividendes payés (hors P&L)" value={formatCad(inc.dividendsDistributed)} indent />
        </section>
      </div>
    </div>
  )
}
