import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { payrollEmployerTotal } from '../lib/financials'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { MetricCard, MetricGrid } from '../components/MetricCard'
import { CompensationWorkflowNav, type CompensationStep } from '../components/CompensationWorkflowNav'

function stepFromPath(pathname: string): CompensationStep | undefined {
  if (pathname.endsWith('/dividends')) return 'dividends'
  if (pathname.endsWith('/payroll')) return 'payroll'
  return undefined
}

export function CompensationPage() {
  const location = useLocation()
  const current = stepFromPath(location.pathname)
  const onEmployees = location.pathname.endsWith('/employees')
  const [metrics, setMetrics] = useState({
    activeEmployees: 0,
    payrollCostYtd: 0,
    dividendsYtd: 0,
  })

  useEffect(() => {
    loadMetrics()
  }, [location.pathname])

  async function loadMetrics() {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const [{ data: employees }, { data: payroll }, { data: dividends }] = await Promise.all([
      supabase.from('employees').select('id, active'),
      supabase
        .from('payroll_runs')
        .select(
          'payment_date, gross_pay, cpp_employer, ei_employer, qpip_employer, employer_benefits, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, other_deductions'
        )
        .gte('payment_date', yearStart),
      supabase.from('dividends').select('total_amount, declared_date').gte('declared_date', yearStart),
    ])

    setMetrics({
      activeEmployees: (employees ?? []).filter((e) => e.active).length,
      payrollCostYtd: (payroll ?? []).reduce((s, p) => s + payrollEmployerTotal(p), 0),
      dividendsYtd: (dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0),
    })
  }

  if (onEmployees || location.pathname.endsWith('/shareholders')) {
    return (
      <PageShell width="wide">
        <Outlet context={{ refreshMetrics: loadMetrics }} />
      </PageShell>
    )
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="Rémunération"
        subtitle="Salaire d'employé et dividendes — distincts en comptabilité et fiscalité. Brouillon pour révision CPA."
      />

      <MetricGrid>
        <MetricCard label="Employés actifs" value={metrics.activeEmployees} />
        <MetricCard label={`Coût paie ${new Date().getFullYear()}`} value={formatCad(metrics.payrollCostYtd)} />
        <MetricCard label={`Dividendes déclarés ${new Date().getFullYear()}`} value={formatCad(metrics.dividendsYtd)} />
      </MetricGrid>

      <CompensationWorkflowNav current={current} />

      <Outlet context={{ refreshMetrics: loadMetrics }} />
    </PageShell>
  )
}
