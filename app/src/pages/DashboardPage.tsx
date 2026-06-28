import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, effectiveRate, lineAmount } from '../lib/format'
import { invoiceBalance } from '../lib/invoice'

export function DashboardPage() {
  const [stats, setStats] = useState({
    clients: 0,
    activeProjects: 0,
    unbilledHours: 0,
    unbilledAmount: 0,
    outstanding: 0,
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [clients, projects, entries, invoices, payments] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase
        .from('time_entries')
        .select('hours, rate_override, billable, invoice_id, projects(default_hourly_rate)')
        .is('invoice_id', null)
        .eq('billable', true),
      supabase.from('invoices').select('id, total, status').neq('status', 'void').neq('status', 'paid'),
      supabase.from('payments').select('invoice_id, amount'),
    ])

    let unbilledHours = 0
    let unbilledAmount = 0
    for (const e of entries.data ?? []) {
      const p = e.projects as { default_hourly_rate: number } | null
      if (!p) continue
      unbilledHours += Number(e.hours)
      unbilledAmount += lineAmount(Number(e.hours), effectiveRate(e, p))
    }

    const paidByInvoice: Record<string, number> = {}
    for (const p of payments.data ?? []) {
      paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] ?? 0) + Number(p.amount)
    }
    let outstanding = 0
    for (const inv of invoices.data ?? []) {
      outstanding += invoiceBalance(Number(inv.total), paidByInvoice[inv.id] ?? 0)
    }

    setStats({
      clients: clients.count ?? 0,
      activeProjects: projects.count ?? 0,
      unbilledHours: Math.round(unbilledHours * 10) / 10,
      unbilledAmount,
      outstanding,
    })
  }

  const cards = [
    { label: 'Clients', value: String(stats.clients), to: '/clients' },
    { label: 'Projets actifs', value: String(stats.activeProjects), to: '/projects' },
    { label: 'Heures non facturées', value: `${stats.unbilledHours} h`, to: '/time' },
    { label: 'Montant à facturer', value: formatCad(stats.unbilledAmount), to: '/invoices' },
    { label: 'Encours clients', value: formatCad(stats.outstanding), to: '/payments' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="bg-white border border-border rounded-xl p-5 hover:border-yuzu transition-colors"
          >
            <div className="text-xs text-muted mb-1">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
