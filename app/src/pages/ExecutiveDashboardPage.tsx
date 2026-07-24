import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUpcomingDeadlines } from '../lib/compliance'
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
import { RevenueTrendChart } from '../components/DashboardCharts'
import { ExecutiveBreakdownPanel } from '../components/ExecutiveBreakdownPanel'
import { KpiCard, MetricGrid, TrendBadge } from '../components/MetricCard'
import { UpcomingDeadlinesCard } from '../components/UpcomingDeadlinesCard'
import type { ComplianceDeadline } from '../lib/types'

function RateChip({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex-1 min-w-[10rem] rounded-lg border border-border bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-muted mt-0.5 truncate">{detail}</div>
    </div>
  )
}

export function ExecutiveDashboardPage() {
  const { period, setPeriod, presets, ready } = useDashboardPeriod()
  const [loading, setLoading] = useState(true)
  const [worked, setWorked] = useState({ total: 0, hourly: 0, fixed: 0, hours: 0, hourlyHours: 0, fixedHours: 0 })
  const [invoiced, setInvoiced] = useState(0)
  const [recognized, setRecognized] = useState(0)
  const [collected, setCollected] = useState(0)
  const [unbilled, setUnbilled] = useState(0)
  const [collectionRate, setCollectionRate] = useState<number | null>(null)
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
      setDeadlines(upcoming)
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
    <div className="max-w-[1440px] mx-auto space-y-3 pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Vue exécutive</h1>
          <p className="text-xs text-muted mt-0.5">Prestations · Facturation · Encaissements</p>
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

      <MetricGrid cols={4} dense>
        <KpiCard
          dense
          label="Prestations réalisées"
          value={formatCad(worked.total)}
          sub={`${worked.hours} h · dont ${formatCad(worked.fixed)} forfait`}
          trend={trends.workedRevenue}
          to="/billing/time"
        />
        <KpiCard
          dense
          label="Revenus facturés"
          value={formatCad(invoiced)}
          sub={`HT · GL ${formatCad(recognized)}`}
          trend={trends.invoicedRevenue}
          to="/billing/invoices"
        />
        <KpiCard
          dense
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
        <KpiCard
          dense
          label="À facturer (WIP)"
          value={formatCad(unbilled)}
          sub="Horaire + forfaits non facturés"
          to="/billing/invoices"
        />
      </MetricGrid>

      <div className="flex flex-wrap gap-2">
        <RateChip
          label="$/h moyen — Horaire"
          value={hourlyAvg != null ? `${formatCad(hourlyAvg)}/h` : '—'}
          detail={`${worked.hourlyHours} h · ${formatCad(worked.hourly)}`}
        />
        <RateChip
          label="$/h moyen — Forfait"
          value={fixedAvg != null ? `${formatCad(fixedAvg)}/h` : '—'}
          detail={`${worked.fixedHours} h int. · ${formatCad(worked.fixed)}`}
        />
        <div className="flex-1 min-w-[12rem] rounded-lg border border-border bg-white px-3 py-2 flex flex-col justify-center gap-1">
          <div className="text-[11px] uppercase tracking-wide text-muted">Variation M/M</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">Prest.</span>
              <TrendBadge change={trends.workedRevenue} label="" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">Fact.</span>
              <TrendBadge change={trends.invoicedRevenue} label="" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">Enc.</span>
              <TrendBadge change={trends.cashCollected} label="" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <div className="xl:col-span-2">
          {hasChartData(monthlySeries) ? (
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
