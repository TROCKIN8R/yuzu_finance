import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUpcomingDeadlines } from '../lib/compliance'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { buildFinancialSnapshot } from '../lib/financials'
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from '../lib/glDataLoader'
import { buildMonthlySeries, cumulativeMonthlySeries, hasChartData, seriesInSelectedPeriod } from '../lib/dashboardSeries'
import { buildPartnerBreakdown, buildServiceTypeBreakdown } from '../lib/billingMetrics'
import {
  buildEstimatedDues,
  buildServiceKpiTrends,
  computeWorkedRevenueMetrics,
  type EstimatedDues,
  type MomChange,
} from '../lib/dashboardKpis'
import { fetchDashboardBillingData, fetchExecutiveExtras } from '../lib/dashboardData'
import { DEFAULT_ESTIMATED_CORP_TAX_RATE } from '../lib/organizationSettings'
import { useDashboardPeriod } from '../hooks/useDashboardPeriod'
import { RevenueTrendChart } from '../components/DashboardCharts'
import { ExecutiveBreakdownPanel } from '../components/ExecutiveBreakdownPanel'
import { TrendBadge } from '../components/MetricCard'
import { UpcomingDeadlinesCard } from '../components/UpcomingDeadlinesCard'
import type { ComplianceDeadline } from '../lib/types'

function ActivityMetricRow({
  label,
  value,
  sub,
  trend,
  to,
}: {
  label: string
  value: string
  sub?: string
  trend?: MomChange
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0 -mx-1 px-1 rounded-lg hover:bg-stone-50"
    >
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5 leading-snug">{sub}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
        {trend && (
          <div className="mt-0.5 flex justify-end">
            <TrendBadge change={trend} label="" />
          </div>
        )}
      </div>
    </Link>
  )
}

function DuesLine({
  label,
  value,
  to,
}: {
  label: string
  value: string
  to?: string
}) {
  const inner = (
    <>
      <span className="text-ink">{label}</span>
      <span className="tabular-nums font-medium text-ink">{value}</span>
    </>
  )
  const className = 'flex items-center justify-between gap-3 text-sm py-0.5'
  if (to) {
    return (
      <Link to={to} className={`${className} rounded-md -mx-1 px-1 hover:bg-stone-50`}>
        {inner}
      </Link>
    )
  }
  return <div className={className}>{inner}</div>
}

export function ExecutiveDashboardPage() {
  const { period, setPeriod, presets, ready } = useDashboardPeriod()
  const [loading, setLoading] = useState(true)
  const [worked, setWorked] = useState({ total: 0, hourly: 0, fixed: 0, hours: 0, hourlyHours: 0, fixedHours: 0 })
  const [invoiced, setInvoiced] = useState(0)
  const [recognized, setRecognized] = useState(0)
  const [collected, setCollected] = useState(0)
  const [collectionRate, setCollectionRate] = useState<number | null>(null)
  const [dues, setDues] = useState<EstimatedDues | null>(null)
  const [monthlySeries, setMonthlySeries] = useState<ReturnType<typeof buildMonthlySeries>>([])
  const [partnerRows, setPartnerRows] = useState<ReturnType<typeof buildPartnerBreakdown>>([])
  const [serviceRows, setServiceRows] = useState<ReturnType<typeof buildServiceTypeBreakdown>>([])
  const [deadlines, setDeadlines] = useState<ComplianceDeadline[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (period) load(period)
  }, [period])

  async function load(range: NonNullable<typeof period>) {
    setLoading(true)
    setError(null)
    try {
      const [billing, extras, { data: glData }, reportExtras, settingsRow, upcoming] = await Promise.all([
        fetchDashboardBillingData(),
        fetchExecutiveExtras(),
        fetchGeneralLedgerData(),
        fetchFinancialReportExtras(),
        supabase.from('organization_settings').select('*').maybeSingle(),
        fetchUpcomingDeadlines({ withinDays: 90, limit: 5 }),
      ])

      const fin = buildFinancialSnapshot(
        {
          ...glData,
          bankTransactions: reportExtras.bankTransactions,
          settings: settingsRow.data ?? glData.settings ?? undefined,
        },
        range
      )

      const workedMetrics = computeWorkedRevenueMetrics(billing.timeEntries, range)
      const series = buildMonthlySeries(
        {
          payments: glData.payments,
          expenses: glData.expenses,
          payrollRuns: glData.payrollRuns,
          invoices: glData.invoices.map((inv) => ({
            id: inv.id,
            subtotal: inv.subtotal,
            invoice_date: inv.invoice_date,
            status: inv.status,
          })),
          timeEntries: billing.timeEntries,
          dividends: glData.dividends,
          corporateTax: glData.corporateTax,
          salesTaxRemitted: reportExtras.salesTaxRemitted,
          settings: settingsRow.data ?? undefined,
        },
        range
      )

      setWorked(workedMetrics)
      setInvoiced(fin.income.invoicedSubtotal)
      setRecognized(fin.income.revenueSubtotal)
      setCollected(fin.cashIn)
      setCollectionRate(fin.billing.collectionRatePct)
      setDues(
        buildEstimatedDues(fin, {
          invoices: glData.invoices,
          payments: glData.payments,
          expenses: glData.expenses,
          employeeExpenses: glData.employeeExpenses,
          salesTaxRemittances: glData.salesTaxRemittances,
          estimatedCorpTaxRate: Number(
            settingsRow.data?.estimated_corp_tax_rate ??
              glData.settings?.estimated_corp_tax_rate ??
              DEFAULT_ESTIMATED_CORP_TAX_RATE
          ),
          asOf: range.end || '9999-12-31',
        })
      )
      setMonthlySeries(series)
      setPartnerRows(
        buildPartnerBreakdown(
          billing.timeEntries,
          extras.invoices as { id: string; partner_id: string; subtotal: number; invoice_date: string; status: string }[],
          glData.payments as { amount: number; payment_date?: string | null; invoice_id: string }[],
          billing.partners,
          range
        )
      )
      setServiceRows(
        buildServiceTypeBreakdown(
          billing.timeEntries,
          extras.lines as { invoice_id: string; subtotal: number; unit_label: string }[],
          extras.invoices as { id: string; partner_id: string; subtotal: number; invoice_date: string; status: string }[],
          glData.payments as { amount: number; payment_date?: string | null; invoice_id: string }[],
          range
        )
      )
      setDeadlines(upcoming)
    } catch (err) {
      console.error('Executive dashboard load failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du tableau de bord.')
    } finally {
      setLoading(false)
    }
  }

  const trends = useMemo(() => buildServiceKpiTrends(monthlySeries), [monthlySeries])
  const chartSeries = useMemo(() => (period ? seriesInSelectedPeriod(monthlySeries, period) : monthlySeries), [monthlySeries, period])
  const cumulativeSeries = useMemo(() => cumulativeMonthlySeries(chartSeries), [chartSeries])

  if (!ready || !period || loading) return <div className="text-muted">Chargement…</div>

  if (error || !dues) {
    return (
      <div className="max-w-xl mx-auto ui-card p-6 space-y-3">
        <h1 className="text-lg font-semibold">Vue exécutive</h1>
        <p className="text-sm text-red-700">{error ?? 'Impossible de calculer les dues estimées.'}</p>
        <p className="text-xs text-muted">
          Brouillon pour révision — souvent causé par une paie dont le net ne correspond pas aux remboursements liés.
        </p>
        <button
          type="button"
          className="text-sm font-medium px-3 py-2 rounded-lg border border-border bg-white hover:border-yuzu/50"
          onClick={() => period && load(period)}
        >
          Réessayer
        </button>
      </div>
    )
  }

  const remainingTone =
    dues.estimatedRemaining < 0 ? 'text-red-700' : dues.totalDue > 0 ? 'text-ink' : 'text-emerald-800'

  return (
    <div className="max-w-[1440px] mx-auto space-y-3 pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Vue exécutive</h1>
          <p className="text-xs text-muted mt-0.5">Prestations · Facturation · Encaissements · Dues estimées</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-white min-h-[36px]"
            value={presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end)}
            onChange={(e) => setPeriod(presets[Number(e.target.value)])}
            aria-label="Période"
          >
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <Link
            to="/dashboard/details"
            className="text-sm font-medium px-2.5 py-1.5 rounded-lg border border-border bg-white hover:border-yuzu/50 min-h-[36px] inline-flex items-center"
          >
            Détails →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="ui-card px-3 py-2.5 h-full flex flex-col">
          <div className="ui-metric-label leading-tight mb-1">Activité</div>
          <div className="divide-y divide-border flex-1">
            <ActivityMetricRow
              label="Prestations réalisées"
              value={formatCad(worked.total)}
              sub={`${worked.hours} h · dont ${formatCad(worked.fixed)} forfait`}
              trend={trends.workedRevenue}
              to="/billing/time"
            />
            <ActivityMetricRow
              label="Revenus facturés"
              value={formatCad(invoiced)}
              sub={`HT · GL ${formatCad(recognized)}`}
              trend={trends.invoicedRevenue}
              to="/billing/invoices"
            />
            <ActivityMetricRow
              label="Encaissements"
              value={formatCad(collected)}
              sub={
                collectionRate != null
                  ? `${collectionRate.toFixed(1)} % encaissé (TTC cumul.)`
                  : 'Paiements clients'
              }
              trend={trends.cashCollected}
              to="/billing/invoices"
            />
          </div>
        </div>

        <div className="ui-card px-3 py-2.5 h-full flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="ui-metric-label leading-tight">Dues estimées</div>
              <p className="text-[11px] text-muted mt-0.5">Brouillon pour révision — trésorerie après obligations</p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 flex-1">
            <DuesLine
              label="Trésorerie (compte bancaire)"
              value={formatCad(dues.cash)}
              to="/bank"
            />
            <DuesLine
              label="Cotisations à verser"
              value={formatCad(dues.payrollUnpaid)}
              to="/compensation/payroll"
            />
            <DuesLine label="Taxes de vente à verser" value={formatCad(dues.salesTaxUnpaid)} to="/sales-tax" />
            <DuesLine label="Impôt société à verser" value={formatCad(dues.companyTaxUnpaid)} to="/corporate-tax" />
            <div className="border-t border-border mt-1.5 pt-1.5 space-y-0.5">
              <DuesLine label="Total à payer" value={formatCad(dues.totalDue)} />
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span className="text-sm font-semibold">Solde estimé</span>
                <span className={`text-lg font-semibold tabular-nums leading-tight ${remainingTone}`}>
                  {formatCad(dues.estimatedRemaining)}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted mt-2 leading-snug">
            {dues.cashFromBankImport ? 'Solde relevé importé' : 'Solde GL (aucun relevé importé)'}
            {' · '}
            TPS/TVQ sur factures encaissées, nettes d'ITCs et remises · impôt = (ventes HT − salaires − coûts) ×{' '}
            {(dues.corpTaxRate * 100).toFixed(1)} % (brouillon).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <div className="xl:col-span-2">
          {hasChartData(chartSeries) ? (
            <RevenueTrendChart points={cumulativeSeries} cumulative compact />
          ) : (
            <div className="ui-card px-4 py-8 text-center text-sm text-muted">
              Les tendances apparaîtront lorsque vous aurez des prestations, factures ou encaissements.
            </div>
          )}
        </div>
        <UpcomingDeadlinesCard rows={deadlines} compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExecutiveBreakdownPanel title="Par client" rows={partnerRows} emptyMessage="Aucune activité client sur la période." dense />
        <ExecutiveBreakdownPanel
          title="Par type de service"
          rows={serviceRows}
          emptyMessage="Aucune prestation horaire ou forfaitaire sur la période."
          dense
        />
      </div>

      <p className="text-[11px] text-muted">
        Brouillon pour révision — forfaits proratisés selon les heures internes saisies.
      </p>
    </div>
  )
}
