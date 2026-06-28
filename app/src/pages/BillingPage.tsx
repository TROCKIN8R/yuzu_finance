import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { effectiveRate, formatCad, relationOne } from '../lib/format'
import type { TimeEntry } from '../lib/types'
import { PageHeader } from '../components/PageHeader'
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
        .select('hours, rate_override, projects(default_hourly_rate, billing_type)')
        .is('invoice_id', null)
        .eq('billable', true),
      supabase.from('invoices').select('id').eq('status', 'draft'),
    ])

    let unbilledHours = 0
    let unbilledAmount = 0
    for (const e of (entries ?? []) as TimeEntry[]) {
      const p = relationOne(e.projects)
      if (!p || p.billing_type === 'fixed') continue
      const rate = effectiveRate(e, p)
      unbilledHours += Number(e.hours)
      unbilledAmount += Number(e.hours) * rate
    }

    setMetrics({
      unbilledHours: Math.round(unbilledHours * 10) / 10,
      unbilledAmount,
      draftInvoices: drafts?.length ?? 0,
    })
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Prestation à encaissement"
        subtitle={
          <>
            Cycle de facturation pour mandats horaires et forfaitaires — pas de devis ni bon de commande.{' '}
            <Link to="/partners" className="text-yuzu-dark hover:underline">
              Partenaires clients
            </Link>{' '}
            requis en amont.
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Heures non facturées</div>
          <div className="text-lg font-semibold mt-0.5">{metrics.unbilledHours} h</div>
        </div>
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Temps à facturer</div>
          <div className="text-lg font-semibold mt-0.5">{formatCad(metrics.unbilledAmount)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Factures brouillon</div>
          <div className="text-lg font-semibold mt-0.5">{metrics.draftInvoices}</div>
        </div>
      </div>

      <BillingWorkflowNav current={current} />

      <div className="mt-6">
        <Outlet context={{ refreshMetrics: loadMetrics }} />
      </div>
    </div>
  )
}
