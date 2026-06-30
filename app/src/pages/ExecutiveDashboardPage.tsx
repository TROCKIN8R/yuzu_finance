import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { buildFinancialSnapshot } from '../lib/financials'
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from '../lib/glDataLoader'
import { buildMonthlySeries, cumulativeMonthlySeries, hasChartData } from '../lib/dashboardSeries'
import {
  averageRate,
  buildPartnerBreakdown,
  buildServiceTypeBreakdown,
  computeUnbilledWip,
} from '../lib/billingMetrics'
import {
  buildServiceKpiTrends,
  computeWorkedRevenueMetrics,
} from '../lib/dashboardKpis'
import {
  fetchDashboardBillingData,
  fetchExecutiveExtras,
} from '../lib/dashboardData'
import { useDashboardPeriod } from '../hooks/useDashboardPeriod'
import { inPeriod } from '../lib/fiscalPeriod'
import { RevenueTrendChart } from '../components/DashboardCharts'
import { ExecutiveBreakdownPanel } from '../components/ExecutiveBreakdownPanel'
import { KpiCard, MetricGrid, TrendBadge } from '../components/MetricCard'

export function ExecutiveDashboardPage() {
  const { period, setPeriod, presets, ready } = useDashboardPeriod()
  const [loading, setLoading] = useState(true)
  const [worked, setWorked] = useState({ total: 0, hourly: 0, fixed: 0, hours: 0, hourlyHours: 0, fixedHours: 0 })
  const [invoiced, setInvoiced] = useState(0)
  const [recognized, setRecognized] = useState(0)
  const [collected, setCollected] = useState(0)
  const [unbilled, setUnbilled] = useState(0)
  const [monthlySeries, setMonthlySeries] = useState<ReturnType<typeof buildMonthlySeries>>([])
  const [partnerRows, setPartnerRows] = useState<ReturnType<typeof buildPartnerBreakdown>>([])
  const [serviceRows, setServiceRows] = useState<ReturnType<typeof buildServiceTypeBreakdown>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (period) load(period)
  }, [period])

  async function load(range: NonNullable<typeof period>) {
    setLoading(true)
    setError(null)
    try {
      const [billing, extras, { data: glData }, reportExtras, settingsRow] = await Promise.all([
        fetchDashboardBillingData(),
        fetchExecutiveExtras(),
        fetchGeneralLedgerData(),
        fetchFinancialReportExtras(),
        supabase.from('organization_settings').select('*').maybeSingle(),
      ])

      const fin = buildFinancialSnapshot(
        {
          ...glData,
          settings: settingsRow.data ?? glData.settings ?? undefined,
        },
        range
      )

      const workedMetrics = computeWorkedRevenueMetrics(billing.timeEntries, range)
      const wip = computeUnbilledWip(billing.timeEntries, billing.fixedProjects)
      const series = buildMonthlySeries(
        {
          payments: glData.payments,
          expenses: glData.expenses,
          payrollRuns: glData.payrollRuns,
          invoices: glData.invoices.map((inv) => ({
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
      setInvoiced(
        extras.invoices
          .filter((i) => i.status !== 'void' && i.status !== 'draft' && inPeriod(i.invoice_date, range))
          .reduce((s, i) => s + Number(i.subtotal), 0)
      )
      setRecognized(fin.income.revenueSubtotal)
      setCollected(fin.cashIn)
      setUnbilled(wip.amount)
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
    } catch (err) {
      console.error('Executive dashboard load failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du tableau de bord.')
    } finally {
      setLoading(false)
    }
  }

  const trends = useMemo(() => buildServiceKpiTrends(monthlySeries), [monthlySeries])
  const cumulativeSeries = useMemo(() => cumulativeMonthlySeries(monthlySeries), [monthlySeries])
  const hourlyAvg = averageRate(worked.hourly, worked.hourlyHours)
  const fixedAvg = averageRate(worked.fixed, worked.fixedHours)

  if (!ready || !period || loading) return <div className="text-muted">Chargement…</div>

  if (error) {
    return (
      <div className="max-w-xl mx-auto ui-card p-6 space-y-3">
        <h1 className="text-lg font-semibold">Vue exécutive</h1>
        <p className="text-sm text-red-700">{error}</p>
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

  return (
    <div className="max-w-[1440px] mx-auto space-y-4 lg:space-y-5 pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">Vue exécutive</h1>
          <p className="text-sm text-muted mt-0.5">Prestations · Facturation · Encaissements — {period.label}</p>
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
          <Link
            to="/dashboard/details"
            className="text-sm font-medium px-3 py-2 rounded-lg border border-border bg-white hover:border-yuzu/50"
          >
            Vue détaillée →
          </Link>
        </div>
      </div>

      <MetricGrid cols={4}>
        <KpiCard
          label="Prestations réalisées"
          value={formatCad(worked.total)}
          sub={`${worked.hours} h · dont ${formatCad(worked.fixed)} forfait`}
          trend={trends.workedRevenue}
          to="/billing/time"
        />
        <KpiCard
          label="Revenus facturés"
          value={formatCad(invoiced)}
          sub={`HT · GL comptabilisé ${formatCad(recognized)}`}
          trend={trends.invoicedRevenue}
          to="/billing/invoices"
        />
        <KpiCard
          label="Encaissements"
          value={formatCad(collected)}
          sub="Paiements clients"
          trend={trends.cashCollected}
          to="/billing/invoices"
        />
        <KpiCard label="À facturer (WIP)" value={formatCad(unbilled)} sub="Temps horaire + forfaits non facturés" to="/billing/invoices" />
      </MetricGrid>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="ui-card px-4 py-3">
          <div className="ui-metric-label">$/h moyen — Horaire</div>
          <div className="text-xl font-semibold mt-0.5">{hourlyAvg != null ? `${formatCad(hourlyAvg)}/h` : '—'}</div>
          <div className="text-xs text-muted mt-1">{worked.hourlyHours} h · {formatCad(worked.hourly)} prestations</div>
        </div>
        <div className="ui-card px-4 py-3">
          <div className="ui-metric-label">$/h moyen — Forfait</div>
          <div className="text-xl font-semibold mt-0.5">{fixedAvg != null ? `${formatCad(fixedAvg)}/h` : '—'}</div>
          <div className="text-xs text-muted mt-1">{worked.fixedHours} h internes · {formatCad(worked.fixed)} prorata</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-[240px]">
        <div className="xl:col-span-2">
          {hasChartData(monthlySeries) ? (
            <RevenueTrendChart points={cumulativeSeries} cumulative />
          ) : (
            <div className="ui-card p-8 text-center text-sm text-muted h-full flex items-center justify-center">
              Les tendances apparaîtront lorsque vous aurez des prestations, factures ou encaissements.
            </div>
          )}
        </div>
        <div className="ui-card p-4 flex flex-col justify-center gap-3">
          <div className="text-sm font-semibold">Variation M/M (dernier mois)</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">Prestations</span>
              <TrendBadge change={trends.workedRevenue} label="" />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">Facturé</span>
              <TrendBadge change={trends.invoicedRevenue} label="" />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">Encaissé</span>
              <TrendBadge change={trends.cashCollected} label="" />
            </div>
          </div>
          <p className="text-xs text-muted pt-2 border-t border-border">
            Brouillon pour révision — les forfaits sont proratisés selon les heures internes saisies.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[280px]">
        <ExecutiveBreakdownPanel title="Par client" rows={partnerRows} emptyMessage="Aucune activité client sur la période." />
        <ExecutiveBreakdownPanel title="Par type de service" rows={serviceRows} emptyMessage="Aucune prestation horaire ou forfaitaire sur la période." />
      </div>
    </div>
  )
}
