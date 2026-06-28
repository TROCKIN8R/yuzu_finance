import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCad } from '../lib/format'
import { payrollEmployerTotal } from '../lib/financials'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
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
      supabase.from('dividends').select('total_amount, payment_date').gte('payment_date', yearStart),
    ])

    setMetrics({
      activeEmployees: (employees ?? []).filter((e) => e.active).length,
      payrollCostYtd: (payroll ?? []).reduce((s, p) => s + payrollEmployerTotal(p), 0),
      dividendsYtd: (dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0),
    })
  }

  if (onEmployees) {
    return (
      <div className="max-w-6xl">
        <Outlet context={{ refreshMetrics: loadMetrics }} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Rémunération"
        subtitle="Salaire d'employé et dividendes — distincts en comptabilité et fiscalité. Brouillon pour révision CPA."
        actions={
          <Link to="/compensation/employees">
            <Button variant="secondary">Employés</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Employés actifs</div>
          <div className="text-lg font-semibold mt-0.5">{metrics.activeEmployees}</div>
        </div>
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Coût paie {new Date().getFullYear()}</div>
          <div className="text-lg font-semibold mt-0.5">{formatCad(metrics.payrollCostYtd)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Dividendes {new Date().getFullYear()}</div>
          <div className="text-lg font-semibold mt-0.5">{formatCad(metrics.dividendsYtd)}</div>
        </div>
      </div>

      <CompensationWorkflowNav current={current} />

      <div className="mt-6">
        <Outlet context={{ refreshMetrics: loadMetrics }} />
      </div>
    </div>
  )
}
