import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, relationOne } from '../lib/format'
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
  const [metrics, setMetrics] = useState({ unbilledHours: 0, unbilledAmount: 0, draftInvoices: 0 })

  useEffect(() => {
    loadMetrics()
  }, [location.pathname])

  async function loadMetrics() {
    const [{ data: entries }, { data: drafts }] = await Promise.all([
      supabase
        .from('time_entries')
        .select('hours, rate_override, projects(default_hourly_rate)')
        .is('invoice_id', null)
        .eq('billable', true),
      supabase.from('invoices').select('id').eq('status', 'draft'),
    ])

    let unbilledHours = 0
    let unbilledAmount = 0
    for (const e of entries ?? []) {
      const p = relationOne<{ default_hourly_rate: number }>(e.projects)
      if (!p) continue
      const rate = e.rate_override ?? p.default_hourly_rate
      unbilledHours += Number(e.hours)
      unbilledAmount += Number(e.hours) * Number(rate)
    }

    setMetrics({
      unbilledHours: Math.round(unbilledHours * 10) / 10,
      unbilledAmount,
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

      <MetricGrid>
        <MetricCard label="Heures non facturées" value={`${metrics.unbilledHours} h`} />
        <MetricCard label="Temps à facturer" value={formatCad(metrics.unbilledAmount)} />
        <MetricCard label="Factures brouillon" value={metrics.draftInvoices} />
      </MetricGrid>

      <BillingWorkflowNav current={current} />

      <Outlet context={{ refreshMetrics: loadMetrics }} />
    </PageShell>
  )
}
