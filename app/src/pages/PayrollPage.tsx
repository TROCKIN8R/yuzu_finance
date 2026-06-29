import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Employee, EmployeeExpense, PayrollRun, RemittanceStatus } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { inDateRange, matchesSearch, countActiveFilters } from '../lib/filters'
import { payrollEmployerTotal, employeeDeductionsTotal, employerContributionsTotal } from '../lib/financials'
import {
  calculatePayrollDeductions,
  employeeDisplayName,
  EMPLOYEE_DEDUCTION_FIELDS,
  EMPLOYER_CONTRIBUTION_FIELDS,
  payFrequencyLabel,
  payPeriodRange,
  sumEmployeeDeductions,
  sumEmployerContributions,
} from '../lib/payrollCalc'
import { deletePayrollRun, linkReimbursements } from '../lib/payrollActions'
import {
  netPayWithReimbursement,
  reimbursementTotals,
} from '../lib/reimbursement'
import { recalculatePayrollWithReimbursements } from '../lib/payrollForm'
import { EXPENSE_CATEGORY_LABELS } from '../lib/chartOfAccounts'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { DateRangeFilter, FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { StepPanelHeader } from '../components/WorkflowNav'
import { WorkflowFooter } from '../components/WorkflowFooter'
import { PageShell } from '../components/PageShell'
import { AlertBanner } from '../components/AlertBanner'

type CompensationOutletContext = { refreshMetrics?: () => void }

type PayrollForm = {
  employee_id: string
  pay_period_start: string
  pay_period_end: string
  payment_date: string
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  other_deductions: number
  employer_benefits: number
  notes: string
  remittance_status: RemittanceStatus
  remittance_date: string
  remittance_reference: string
}

function calcNet(f: PayrollForm) {
  return (
    f.gross_pay -
    f.federal_tax -
    f.provincial_tax -
    f.cpp_employee -
    f.ei_employee -
    f.qpip_employee -
    f.other_deductions
  )
}

function payrollFormFromEmployee(emp: Employee, paymentDate = todayIso()): PayrollForm {
  const range = payPeriodRange(paymentDate, emp.pay_frequency)
  const calc = calculatePayrollDeductions({
    yearlySalary: Number(emp.yearly_salary),
    payFrequency: emp.pay_frequency,
    estimatedYearlyIncome: emp.estimated_yearly_income,
  })
  return {
    employee_id: emp.id,
    pay_period_start: range.start,
    pay_period_end: range.end,
    payment_date: paymentDate,
    gross_pay: calc.gross_pay,
    federal_tax: calc.federal_tax,
    provincial_tax: calc.provincial_tax,
    cpp_employee: calc.cpp_employee,
    ei_employee: calc.ei_employee,
    qpip_employee: calc.qpip_employee,
    cpp_employer: calc.cpp_employer,
    ei_employer: calc.ei_employer,
    qpip_employer: calc.qpip_employer,
    other_deductions: 0,
    employer_benefits: 0,
    notes: '',
    remittance_status: 'pending',
    remittance_date: '',
    remittance_reference: '',
  }
}

export function PayrollPage() {
  const location = useLocation()
  const embedded = location.pathname.startsWith('/compensation')
  const { refreshMetrics } = useOutletContext<CompensationOutletContext>() ?? {}
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [form, setForm] = useState<PayrollForm | null>(null)
  const [payEditingId, setPayEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reimbursableExpenses, setReimbursableExpenses] = useState<EmployeeExpense[]>([])
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [salaryGrossBase, setSalaryGrossBase] = useState(0)

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (employeeFilter && p.employee_id !== employeeFilter) return false
      if (!inDateRange(p.payment_date, dateFrom, dateTo)) return false
      const name = p.employees ? employeeDisplayName(p.employees) : ''
      return matchesSearch(
        search,
        name,
        p.notes,
        p.gross_pay,
        p.net_pay,
        p.pay_period_start,
        p.pay_period_end,
        p.payment_date
      )
    })
  }, [rows, search, employeeFilter, dateFrom, dateTo])

  const hasFilters = !!(search || employeeFilter || dateFrom || dateTo)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [emp, pay] = await Promise.all([
      supabase.from('employees').select('*').order('last_name').order('first_name'),
      supabase
        .from('payroll_runs')
        .select('*, employees(first_name, last_name)')
        .order('payment_date', { ascending: false }),
    ])
    setEmployees((emp.data as Employee[]) ?? [])
    setRows((pay.data as PayrollRun[]) ?? [])
    refreshMetrics?.()
  }

  async function loadReimbursableExpenses(employeeId: string, payrollRunId?: string | null) {
    const { data: unreimbursed } = await supabase
      .from('employee_expenses')
      .select('*')
      .eq('employee_id', employeeId)
      .is('payroll_run_id', null)
      .order('expense_date')

    let linked: EmployeeExpense[] = []
    if (payrollRunId) {
      const { data } = await supabase
        .from('employee_expenses')
        .select('*')
        .eq('payroll_run_id', payrollRunId)
        .order('expense_date')
      linked = (data as EmployeeExpense[]) ?? []
    }

    const all = [...linked, ...((unreimbursed as EmployeeExpense[]) ?? [])]
    setReimbursableExpenses(all)
    return all
  }

  function applyPayrollRecalc(
    emp: Employee,
    base: number,
    expenses: EmployeeExpense[],
    selected: Set<string>,
    current: PayrollForm
  ) {
    const updated = recalculatePayrollWithReimbursements({
      emp,
      salaryGrossBase: base,
      expenses,
      selectedIds: selected,
      paymentDate: current.payment_date,
    })
    return {
      ...current,
      ...updated,
      other_deductions: current.other_deductions,
      employer_benefits: current.employer_benefits,
    }
  }

  function toggleExpenseSelection(id: string) {
    const next = new Set(selectedExpenseIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedExpenseIds(next)
    if (!form) return
    const emp = employees.find((e) => e.id === form.employee_id)
    if (!emp) return
    setForm(applyPayrollRecalc(emp, salaryGrossBase, reimbursableExpenses, next, form))
  }

  async function openNewPayroll(emp?: Employee) {
    const target = emp ?? activeEmployees[0]
    if (!target) {
      alert('Ajoutez un employé actif avant de créer une paie.')
      return
    }
    const initial = payrollFormFromEmployee(target)
    setSalaryGrossBase(initial.gross_pay)
    setForm(initial)
    setSelectedExpenseIds(new Set())
    setPayEditingId(null)
    await loadReimbursableExpenses(target.id)
    setPayOpen(true)
  }

  async function openEditPayroll(p: PayrollRun) {
    const gross = Number(p.gross_pay)
    setForm({
      employee_id: p.employee_id ?? '',
      pay_period_start: p.pay_period_start,
      pay_period_end: p.pay_period_end,
      payment_date: p.payment_date,
      gross_pay: gross,
      federal_tax: Number(p.federal_tax),
      provincial_tax: Number(p.provincial_tax),
      cpp_employee: Number(p.cpp_employee),
      ei_employee: Number(p.ei_employee),
      qpip_employee: Number(p.qpip_employee),
      cpp_employer: Number(p.cpp_employer),
      ei_employer: Number(p.ei_employer),
      qpip_employer: Number(p.qpip_employer),
      other_deductions: Number(p.other_deductions),
      employer_benefits: Number(p.employer_benefits),
      notes: p.notes ?? '',
      remittance_status: p.remittance_status ?? 'pending',
      remittance_date: p.remittance_date ?? '',
      remittance_reference: p.remittance_reference ?? '',
    })
    setPayEditingId(p.id)
    if (p.employee_id) {
      const expenses = await loadReimbursableExpenses(p.employee_id, p.id)
      const selected = new Set(expenses.filter((e) => e.payroll_run_id === p.id).map((e) => e.id))
      setSelectedExpenseIds(selected)
      const { taxable } = reimbursementTotals(expenses, selected)
      setSalaryGrossBase(gross - taxable)
    } else {
      setReimbursableExpenses([])
      setSelectedExpenseIds(new Set())
      setSalaryGrossBase(gross)
    }
    setPayOpen(true)
  }

  function recalculateFromSalary() {
    if (!form) return
    const emp = employees.find((e) => e.id === form.employee_id)
    if (!emp) return
    const calc = calculatePayrollDeductions({
      yearlySalary: Number(emp.yearly_salary),
      payFrequency: emp.pay_frequency,
      estimatedYearlyIncome: emp.estimated_yearly_income,
    })
    setSalaryGrossBase(calc.gross_pay)
    setForm(applyPayrollRecalc(emp, calc.gross_pay, reimbursableExpenses, selectedExpenseIds, form))
  }

  async function onPayrollEmployeeChange(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp || !form) return
    const initial = payrollFormFromEmployee(emp, form.payment_date)
    setSalaryGrossBase(initial.gross_pay)
    setForm(initial)
    setSelectedExpenseIds(new Set())
    await loadReimbursableExpenses(employeeId)
  }

  function onPaymentDateChange(paymentDate: string) {
    if (!form) return
    const emp = employees.find((e) => e.id === form.employee_id)
    if (!emp) {
      setForm({ ...form, payment_date: paymentDate })
      return
    }
    const range = payPeriodRange(paymentDate, emp.pay_frequency)
    setForm({ ...form, payment_date: paymentDate, pay_period_start: range.start, pay_period_end: range.end })
  }

  async function savePayroll(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form || !form.employee_id) return
    const emp = employees.find((e) => e.id === form.employee_id)
    if (!emp) return

    const reimb = reimbursementTotals(reimbursableExpenses, selectedExpenseIds)
    const recalc = recalculatePayrollWithReimbursements({
      emp,
      salaryGrossBase,
      expenses: reimbursableExpenses,
      selectedIds: selectedExpenseIds,
      paymentDate: form.payment_date,
    })
    const formWithGross = {
      ...form,
      ...recalc,
      other_deductions: form.other_deductions,
      employer_benefits: form.employer_benefits,
    }
    const salaryNet = calcNet(formWithGross)
    const net_pay = netPayWithReimbursement(salaryNet, reimb.nonTaxable)
    const payload = {
      ...formWithGross,
      net_pay,
      reimbursement_total: reimb.total,
      employee_id: form.employee_id,
      remittance_date: form.remittance_date || null,
      remittance_reference: form.remittance_reference || null,
    }
    const selectedIds = [...selectedExpenseIds]
    if (payEditingId) {
      await supabase.from('payroll_runs').update(payload).eq('id', payEditingId)
      await linkReimbursements(payEditingId, selectedIds, payEditingId)
    } else {
      const { data, error } = await supabase.from('payroll_runs').insert(payload).select('id').single()
      if (error || !data) {
        alert(error?.message ?? 'Erreur lors de la création de la paie')
        return
      }
      await linkReimbursements(data.id, selectedIds)
    }
    setPayOpen(false)
    load()
  }

  async function removePayroll(id: string) {
    if (!confirm('Supprimer cette paie ?')) return
    try {
      await deletePayrollRun(id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la suppression')
      return
    }
    load()
  }

  const ytdCost = filtered.reduce((s, p) => s + payrollEmployerTotal(p), 0)
  const ytdEmployeeDeductions = filtered.reduce((s, p) => s + employeeDeductionsTotal(p), 0)
  const ytdEmployerContributions = filtered.reduce((s, p) => s + employerContributionsTotal(p), 0)
  const ytdGross = filtered.reduce((s, p) => s + Number(p.gross_pay), 0)
  const selectedEmp = form ? employees.find((e) => e.id === form.employee_id) : null
  const reimbPreview = reimbursementTotals(reimbursableExpenses, selectedExpenseIds)
  const previewSalaryNet = form ? calcNet(form) : 0
  const previewNetPay = netPayWithReimbursement(previewSalaryNet, reimbPreview.nonTaxable)

  const payrollActions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/employee-expenses">
        <Button variant="secondary">Frais à rembourser</Button>
      </Link>
      <Button onClick={() => openNewPayroll()} disabled={activeEmployees.length === 0}>
        Nouvelle paie
      </Button>
    </div>
  )

  return (
    <PageShell className={embedded ? undefined : 'space-y-10'}>
      <section>
        {embedded ? (
          <StepPanelHeader
            step={1}
            totalSteps={2}
            title="Salaire"
            hint="Paies, retenues et remises source."
            actions={payrollActions}
          />
        ) : (
          <PageHeader
            title="Paie"
            subtitle={
              <>
                Brut{hasFilters ? ' (filtré)' : ''} : {formatCad(ytdGross)}
                {' · '}
                Retenues employé : {formatCad(ytdEmployeeDeductions)}
                {' · '}
                Charges employeur : {formatCad(ytdEmployerContributions)}
                {' · '}
                Coût total : {formatCad(ytdCost)}
              </>
            }
            actions={payrollActions}
          />
        )}
        {activeEmployees.length === 0 && (
          <AlertBanner>
            Aucun employé actif —{' '}
            <Link to="/compensation/employees" className="font-medium underline">
              ajoutez un employé
            </Link>{' '}
            avant de créer une paie.
          </AlertBanner>
        )}
        {embedded && (
          <p className="text-sm text-muted mb-4">
            Brut{hasFilters ? ' (filtré)' : ''} : {formatCad(ytdGross)} · Coût total : {formatCad(ytdCost)}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState message="Aucune paie enregistrée." />
        ) : (
          <>
            <ListToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Employé, période, montants…"
              resultCount={filtered.length}
              totalCount={rows.length}
              activeFilterCount={countActiveFilters(!!search, !!employeeFilter, !!dateFrom, !!dateTo)}
              clearVisible={hasFilters}
              onClearFilters={() => {
                setSearch('')
                setEmployeeFilter('')
                setDateFrom('')
                setDateTo('')
              }}
            >
              <FilterSelect
                label="Employé"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={[
                  { value: '', label: 'Tous' },
                  ...employees.map((e) => ({ value: e.id, label: employeeDisplayName(e) })),
                ]}
              />
              <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            </ListToolbar>
            {filtered.length === 0 ? (
              <EmptyState message="Aucune paie ne correspond aux filtres." />
            ) : (
              <DataTable minWidth={1100}>
      
                  <thead className="bg-stone-50 text-muted text-left">
                    <tr>
                      <th className="px-4 py-3">Employé</th>
                      <th className="px-4 py-3">Période</th>
                      <th className="px-4 py-3">Brut</th>
                      <th className="px-4 py-3">Retenues employé</th>
                      <th className="px-4 py-3">Net</th>
                      <th className="px-4 py-3">Charges employeur</th>
                      <th className="px-4 py-3">Coût total</th>
                      <th className="px-4 py-3">Payé le</th>
                      <th className="px-4 py-3">Remise</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium">
                          {p.employees ? employeeDisplayName(p.employees) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {formatDate(p.pay_period_start)} – {formatDate(p.pay_period_end)}
                        </td>
                        <td className="px-4 py-3">{formatCad(p.gross_pay)}</td>
                        <td className="px-4 py-3 text-muted">{formatCad(employeeDeductionsTotal(p))}</td>
                        <td className="px-4 py-3">
                          {formatCad(p.net_pay)}
                          {Number(p.reimbursement_total) > 0 && (
                            <span className="block text-xs text-muted">+ {formatCad(p.reimbursement_total)} remb.</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">{formatCad(employerContributionsTotal(p))}</td>
                        <td className="px-4 py-3 font-medium">{formatCad(payrollEmployerTotal(p))}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(p.payment_date)}</td>
                        <td className="px-4 py-3">
                          <Badge
                            label={p.remittance_status === 'remitted' ? 'remise' : 'en attente'}
                            tone={p.remittance_status === 'remitted' ? 'active' : 'draft'}
                          />
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button variant="ghost" className={tableActionClass} onClick={() => openEditPayroll(p)}>
                            Mod.
                          </Button>
                          <Button variant="danger" className={tableActionClass} onClick={() => removePayroll(p.id)}>
                            Suppr.
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </DataTable>
            )}
          </>
        )}
      </section>

      {embedded && rows.length > 0 && (
        <WorkflowFooter to="/compensation/dividends" label="Enregistrer un dividende">
          Distribution aux actionnaires ?
        </WorkflowFooter>
      )}

      <Modal title={payEditingId ? 'Modifier paie' : 'Nouvelle paie'} open={payOpen} onClose={() => setPayOpen(false)} wide>
        {form && (
          <form onSubmit={savePayroll} className="space-y-3 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Employé *" className="flex-1 min-w-[200px]">
                <select className={inputClass} required value={form.employee_id} onChange={(e) => onPayrollEmployeeChange(e.target.value)}>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{employeeDisplayName(e)}</option>
                  ))}
                </select>
              </Field>
              <Button type="button" variant="secondary" onClick={recalculateFromSalary}>
                Recalculer depuis salaire
              </Button>
            </div>
            {selectedEmp && (
              <p className="text-xs text-muted">
                {formatCad(selectedEmp.yearly_salary)} / an · {payFrequencyLabel(selectedEmp.pay_frequency)}
                {selectedEmp.estimated_yearly_income != null && (
                  <> · Revenu estimé impôts : {formatCad(selectedEmp.estimated_yearly_income)}</>
                )}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Début période">
                <input type="date" className={inputClass} required value={form.pay_period_start} onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })} />
              </Field>
              <Field label="Fin période">
                <input type="date" className={inputClass} required value={form.pay_period_end} onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })} />
              </Field>
              <Field label="Date paiement">
                <input type="date" className={inputClass} required value={form.payment_date} onChange={(e) => onPaymentDateChange(e.target.value)} />
              </Field>
            </div>
            <Field label="Salaire brut *">
              <input type="number" step="0.01" className={inputClass} required value={form.gross_pay} onChange={(e) => setForm({ ...form, gross_pay: Number(e.target.value) })} />
            </Field>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-stone-50 px-4 py-2 border-b border-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Part employé — retenues sur salaire</p>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {EMPLOYEE_DEDUCTION_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input type="number" step="0.01" className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
                  </Field>
                ))}
              </div>
              <div className="px-4 pb-3 text-sm text-right text-muted">
                Total retenues employé : <strong className="text-ink">{formatCad(sumEmployeeDeductions(form))}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 overflow-hidden">
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Part employeur — cotisations et charges</p>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EMPLOYER_CONTRIBUTION_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input type="number" step="0.01" className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
                  </Field>
                ))}
              </div>
              <div className="px-4 pb-3 text-sm text-right text-muted">
                Total charges employeur : <strong className="text-ink">{formatCad(sumEmployerContributions(form))}</strong>
              </div>
            </div>

            {reimbursableExpenses.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-stone-50 px-4 py-2 border-b border-border flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Frais à rembourser</p>
                  <span className="text-xs text-muted">{selectedExpenseIds.size} sélectionné(s)</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {reimbursableExpenses.map((e) => (
                    <label key={e.id} className="flex items-start gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-stone-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedExpenseIds.has(e.id)}
                        onChange={() => toggleExpenseSelection(e.id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{e.vendor}</span>
                        <span className="text-muted"> — {formatDate(e.expense_date)}</span>
                        <span className="block text-xs text-muted truncate">
                          {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                          {e.description ? ` · ${e.description}` : ''}
                          {e.taxable ? ' · imposable' : ' · non imposable'}
                        </span>
                      </span>
                      <span className="font-medium shrink-0">{formatCad(e.total)}</span>
                    </label>
                  ))}
                </div>
                {reimbPreview.total > 0 && (
                  <div className="px-4 py-2 text-xs text-muted border-t border-border space-y-0.5">
                    <div className="flex justify-between">
                      <span>Non imposable (ajouté au net)</span>
                      <span>{formatCad(reimbPreview.nonTaxable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Imposable (ajouté au brut)</span>
                      <span>{formatCad(reimbPreview.taxable)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-yuzu-light rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">Salaire net (retenues déduites)</span>
                <strong>{formatCad(previewSalaryNet)}</strong>
              </div>
              {reimbPreview.nonTaxable > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Remboursements non imposables</span>
                  <span>+ {formatCad(reimbPreview.nonTaxable)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Net versé à l&apos;employé</span>
                <strong>{formatCad(previewNetPay)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Retenues à remettre (employé)</span>
                <span>{formatCad(sumEmployeeDeductions(form))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Cotisations employeur</span>
                <span>{formatCad(sumEmployerContributions(form))}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-yuzu/30 font-semibold">
                <span>Coût total employeur</span>
                <span>{formatCad(form.gross_pay + sumEmployerContributions(form))}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
              <Field label="Statut remise">
                <select
                  className={inputClass}
                  value={form.remittance_status}
                  onChange={(e) => setForm({ ...form, remittance_status: e.target.value as RemittanceStatus })}
                >
                  <option value="pending">En attente</option>
                  <option value="remitted">Remise effectuée</option>
                </select>
              </Field>
              <Field label="Date remise">
                <input
                  type="date"
                  className={inputClass}
                  value={form.remittance_date}
                  onChange={(e) => setForm({ ...form, remittance_date: e.target.value })}
                />
              </Field>
              <Field label="Référence remise">
                <input
                  className={inputClass}
                  value={form.remittance_reference}
                  onChange={(e) => setForm({ ...form, remittance_reference: e.target.value })}
                  placeholder="N° confirmation ARC"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        )}
      </Modal>
    </PageShell>
  )
}
