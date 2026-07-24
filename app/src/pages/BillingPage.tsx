import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { computeUnbilledWip, type MetricsProject } from '../lib/billingMetrics'
import { FIXED_PROJECT_SELECT, TIME_ENTRY_SELECT } from '../lib/dashboardData'
import { entriesToMetrics } from '../lib/timeEntries'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { BillingWorkflowNav, type BillingStep } from '../components/BillingWorkflowNav'

function stepFromPath(pathname: string): BillingStep | undefined {
  if (pathname.endsWith('/time')) return 'time'
  if (pathname.endsWith('/invoices')) return 'invoices'
  if (pathname.endsWith('/projects')) return 'projects'
  return undefined
}

function MetricChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-xs text-muted whitespace-nowrap">{label}</span>
      <span className="text-sm font-semibold tabular-nums truncate">{value}</span>
    </div>
  )
}

export function BillingPage() {
  const location = useLocation()
  const current = stepFromPath(location.pathname)
  const [metrics, setMetrics] = useState({ unbilledHours: 0, unbilledAmount: 0, fixedWip: 0, draftInvoices: 0 })

  useEffect(() => {
    loadMetrics()
  }, [location.pathname])

  async function loadMetrics() {
    const [{ data: entries }, { data: fixedProjects }, { data: drafts }] = await Promise.all([
      supabase.from('time_entries').select(TIME_ENTRY_SELECT),
      supabase.from('projects').select(FIXED_PROJECT_SELECT),
      supabase.from('invoices').select('id').eq('status', 'draft'),
    ])

    const wip = computeUnbilledWip(entriesToMetrics(entries ?? []), (fixedProjects ?? []) as MetricsProject[])

    setMetrics({
      unbilledHours: wip.hours,
      unbilledAmount: wip.amount,
      fixedWip: wip.fixedAmount,
      draftInvoices: drafts?.length ?? 0,
    })
  }

  return (
    <PageShell width="wide" className="space-y-4">
      <PageHeader
        title="Prestations"
        subtitle={
          <>
            Cycle de facturation —{' '}
            <Link to="/partners" className="text-yuzu-dark hover:underline">
              partenaires clients
            </Link>{' '}
            requis en amont.
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-white px-3 py-2.5">
        <MetricChip label="Non facturé" value={`${metrics.unbilledHours} h`} />
        <MetricChip label="Horaire" value={formatCad(metrics.unbilledAmount - metrics.fixedWip)} />
        <MetricChip label="Forfaits" value={formatCad(metrics.fixedWip)} />
        <MetricChip label="Brouillons" value={metrics.draftInvoices} />
      </div>

      <BillingWorkflowNav current={current} />

      <Outlet context={{ refreshMetrics: loadMetrics }} />
    </PageShell>
  )
}
