import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad, relationOne } from '../lib/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'

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
  const [ops, setOps] = useState({ clients: 0, unbilledHours: 0, unbilledAmount: 0 })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [clients, entries, invoices, payments, expenses, payroll, dividends, corpTax, salesTaxPaid] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase
        .from('time_entries')
        .select('hours, rate_override, billable, invoice_id, projects(default_hourly_rate)')
        .is('invoice_id', null)
        .eq('billable', true),
      supabase.from('invoices').select('id, total, status, subtotal, gst, qst').neq('status', 'void'),
      supabase.from('payments').select('invoice_id, amount'),
      supabase.from('expenses').select('amount, total, paid, gst, qst, category'),
      supabase
        .from('payroll_runs')
        .select(
          'gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, net_pay'
        ),
      supabase.from('dividends').select('total_amount'),
      supabase.from('corporate_tax_records').select('amount, paid_amount, status'),
      supabase.from('sales_tax_periods').select('gst_net, qst_net').eq('status', 'paid'),
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
        invoices: (invoices.data ?? []) as { id: string; total: number; status: string; subtotal: number; gst: number; qst: number }[],
        invoicePaidMap: paidMap,
        dividends: dividends.data ?? [],
        corporateTax: corpTax.data ?? [],
        salesTaxRemitted: salesTaxPaid.data ?? [],
      })
    )
  }

  if (!fin) return <div className="text-muted">Chargement…</div>

  const cf = fin.cashFlow
  const bs = fin.balanceSheet
  const inc = fin.income

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">Tableau de bord</h1>
        <Link to="/ledger" className="text-sm text-yuzu-dark hover:underline font-medium">
          Voir le grand livre →
        </Link>
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Card label="Encaissements" value={formatCad(fin.cashIn)} sub="Paiements clients" to="/payments" />
          <Card label="Décaissements" value={formatCad(fin.cashOut)} sub="Voir détail ci-dessous" />
          <Card
            label="Trésorerie nette estimée"
            value={formatCad(fin.netCash)}
            sub={fin.netCash >= 0 ? 'Solde positif' : 'Solde négatif'}
          />
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <StmtSection title="Encaissements" />
          <StmtRow label="Paiements clients reçus" value={formatCad(cf.clientPayments)} />

          <StmtSection title="Décaissements" />
          <StmtRow label="Dépenses payées (TTC)" value={formatCad(cf.expensesPaid)} indent negative />
          <StmtRow label="Salaire net versé aux employés" value={formatCad(cf.payrollNetToEmployee)} indent negative />
          <StmtRow
            label="Retenues employé remises (impôts, RPC, AE, RQAP)"
            value={formatCad(cf.employeeWithholdings)}
            indent
            negative
          />
          <StmtRow label="Cotisations employeur" value={formatCad(cf.employerPayrollContributions)} indent negative />
          <StmtRow label="Remises TPS/TVQ" value={formatCad(cf.salesTaxRemitted)} indent negative />
          <StmtRow label="Impôts société payés" value={formatCad(cf.corporateTaxPaid)} indent negative />
          <StmtRow label="Dividendes distribués" value={formatCad(cf.dividendsPaid)} indent negative />
          <StmtRow label="Total décaissements" value={formatCad(fin.cashOut)} bold negative />
        </div>
        <p className="text-xs text-muted mt-2">
          Revenus comptés à l&apos;émission (factures envoyées/payées). TPS/TVQ passif = taxes perçues − CTI/RTI.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Bilan simplifié</h2>
          <p className="text-xs text-muted mb-4">Position au {new Date().toLocaleDateString('fr-CA')}</p>

          <StmtSection title="Actif" />
          <StmtRow label="Trésorerie estimée" value={formatCad(bs.cash)} />
          <StmtRow label="Comptes clients (CC)" value={formatCad(bs.accountsReceivable)} />
          <StmtRow label="TPS à recevoir (CTI)" value={formatCad(bs.gstReceivable)} indent />
          <StmtRow label="TVQ à recevoir (RTI)" value={formatCad(bs.qstReceivable)} indent />
          <StmtRow label="Total actif" value={formatCad(bs.totalAssets)} bold />

          <StmtSection title="Passif" />
          <StmtRow label="Comptes fournisseurs" value={formatCad(bs.accountsPayable)} />
          <StmtRow label="TPS à remettre" value={formatCad(bs.gstPayable)} indent />
          <StmtRow label="TVQ à remettre" value={formatCad(bs.qstPayable)} indent />
          <StmtRow label="Impôts société dus" value={formatCad(bs.corporateTaxDue)} />
          <StmtRow label="Total passif" value={formatCad(bs.totalLiabilities)} bold />

          <StmtSection title="Avoir" />
          <StmtRow label="Avoir des propriétaires (estimé)" value={formatCad(bs.equity)} bold />
        </section>

        <section className="bg-white border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">État des résultats (cumul)</h2>
          <p className="text-xs text-muted mb-4">Base comptable : revenus HT, dépenses HT, paie employeur</p>

          <StmtSection title="Revenus" />
          <StmtRow label="Revenus de services (HT, factures émises)" value={formatCad(inc.revenueSubtotal)} />

          <StmtSection title="Charges d'exploitation" />
          <StmtRow label="Dépenses d'exploitation (HT)" value={formatCad(inc.operatingExpenses)} indent negative />
          <StmtRow label="Salaires bruts" value={formatCad(inc.payrollGross)} indent negative />
          <StmtRow label="Cotisations employeur" value={formatCad(inc.employerPayrollContributions)} indent negative />
          <StmtRow label="Résultat d'exploitation" value={formatCad(inc.operatingIncome)} bold />

          <StmtSection title="Distributions (avoir)" />
          <StmtRow label="Dividendes payés (hors P&L)" value={formatCad(inc.dividendsDistributed)} indent />

          <p className="text-xs text-muted mt-4">
            Les retenues à la source ne sont pas une charge — elles transitent par la paie. Les CTI/RTI réduisent le
            passif TPS/TVQ, pas les dépenses.
          </p>
        </section>
      </div>
    </div>
  )
}
