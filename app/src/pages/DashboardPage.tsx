import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, relationOne } from '../lib/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'

function Card({ label, value, to }: { label: string; value: string; to?: string }) {
  const inner = (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
  return to ? <Link to={to} className="hover:border-yuzu border border-transparent rounded-xl transition-colors">{inner}</Link> : inner
}

function StmtRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-2 border-b border-border text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function DashboardPage() {
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [ops, setOps] = useState({ clients: 0, unbilledHours: 0, unbilledAmount: 0 })

  useEffect(() => { load() }, [])

  async function load() {
    const [clients, entries, invoices, payments, expenses, payroll, salesTax] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('time_entries').select('hours, rate_override, billable, invoice_id, projects(default_hourly_rate)').is('invoice_id', null).eq('billable', true),
      supabase.from('invoices').select('id, total, status, subtotal').neq('status', 'void'),
      supabase.from('payments').select('invoice_id, amount'),
      supabase.from('expenses').select('total, paid'),
      supabase.from('payroll_runs').select('gross_pay, cpp_employer, ei_employer, qpip_employer, employer_benefits, net_pay'),
      supabase.from('sales_tax_periods').select('gst_net, qst_net').eq('status', 'open'),
    ])

    const paidMap: Record<string, number> = {}
    for (const p of payments.data ?? []) paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)

    let unbilledHours = 0
    let unbilledAmount = 0
    for (const e of entries.data ?? []) {
      const p = relationOne<{ default_hourly_rate: number }>(e.projects)
      if (!p) continue
      const rate = e.rate_override ?? p.default_hourly_rate
      unbilledHours += Number(e.hours)
      unbilledAmount += Number(e.hours) * Number(rate)
    }

    setOps({ clients: clients.count ?? 0, unbilledHours: Math.round(unbilledHours * 10) / 10, unbilledAmount })
    setFin(
      buildFinancialSnapshot({
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        payrollRuns: payroll.data ?? [],
        invoices: (invoices.data ?? []) as { id: string; total: number; status: string; subtotal: number }[],
        invoicePaidMap: paidMap,
        salesTaxOpen: salesTax.data ?? [],
      })
    )
  }

  if (!fin) return <div className="text-muted">Chargement…</div>

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Opérations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Clients" value={String(ops.clients)} to="/clients" />
          <Card label="Heures non facturées" value={`${ops.unbilledHours} h`} to="/time" />
          <Card label="À facturer" value={formatCad(ops.unbilledAmount)} to="/invoices" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Flux de trésorerie (cumul)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Encaissements" value={formatCad(fin.cashIn)} to="/payments" />
          <Card label="Décaissements" value={formatCad(fin.cashOut)} to="/expenses" />
          <Card label="Trésorerie nette estimée" value={formatCad(fin.netCash)} />
        </div>
        <p className="text-xs text-muted mt-2">Encaissements = paiements clients. Décaissements = dépenses payées + paie nette + charges employeur.</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Bilan simplifié</h2>
          <p className="text-xs text-muted mb-3 uppercase tracking-wide">Actif</p>
          <StmtRow label="Trésorerie estimée" value={formatCad(fin.assets.cash)} />
          <StmtRow label="Comptes clients (CC)" value={formatCad(fin.assets.accountsReceivable)} />
          <StmtRow label="Total actif" value={formatCad(fin.assets.total)} bold />
          <p className="text-xs text-muted mb-3 mt-4 uppercase tracking-wide">Passif</p>
          <StmtRow label="Comptes fournisseurs" value={formatCad(fin.liabilities.accountsPayable)} />
          <StmtRow label="TPS/TVQ à remettre" value={formatCad(fin.liabilities.salesTaxPayable)} />
          <StmtRow label="Total passif" value={formatCad(fin.liabilities.total)} bold />
          <StmtRow label="Avoir des propriétaires (estimé)" value={formatCad(fin.equity)} bold />
        </section>

        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Résultat (cumul)</h2>
          <StmtRow label="Revenus (sous-total facturé)" value={formatCad(fin.revenueYtd)} />
          <StmtRow label="Dépenses" value={formatCad(fin.expensesYtd)} />
          <StmtRow label="Coût employeur (paie)" value={formatCad(fin.payrollYtd)} />
          <StmtRow
            label="Résultat net estimé"
            value={formatCad(fin.revenueYtd - fin.expensesYtd - fin.payrollYtd)}
            bold
          />
          <p className="text-xs text-muted mt-4">Brouillon de gestion — pour production fiscale, valider avec votre CPA.</p>
        </section>
      </div>
    </div>
  )
}
