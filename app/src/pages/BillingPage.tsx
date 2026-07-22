import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { computeUnbilledWip, type MetricsProject } from '../lib/billingMetrics'
import { FIXED_PROJECT_SELECT, TIME_ENTRY_SELECT } from '../lib/dashboardData'
import { entriesToMetrics } from '../lib/timeEntries'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { MetricCard, MetricGrid } from '../components/MetricCard'
import { BillingWorkflowNav, type BillingStep } from '../components/BillingWorkflowNav'

function stepFromPath(pathname: string): BillingStep | undefined {
  if (pathname.endsWith('/time')) return 'time'
  if (pathname.endsWith('/invoices')) return 'invoices'
  if (pathname.endsWith('/projects')) return 'projects'
  return undefined
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
    <PageShell width="wide">
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

      <MetricGrid cols={4}>
        <MetricCard label="Heures non facturées" value={`${metrics.unbilledHours} h`} hint="Projets horaires seulement" />
        <MetricCard label="Temps à facturer" value={formatCad(metrics.unbilledAmount - metrics.fixedWip)} hint="Horaire non facturé" />
        <MetricCard label="Forfaits à facturer" value={formatCad(metrics.fixedWip)} hint="Projets forfaitaires non facturés" />
        <MetricCard label="Factures brouillon" value={metrics.draftInvoices} />
      </MetricGrid>

      <BillingWorkflowNav current={current} />

      <Outlet context={{ refreshMetrics: loadMetrics }} />
    </PageShell>
  )
}
