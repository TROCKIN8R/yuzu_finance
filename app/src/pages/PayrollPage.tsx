import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee, PayFrequency, PayrollRun } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import { payrollEmployerTotal } from '../lib/financials'
import {
  calculatePayrollDeductions,
  employeeDisplayName,
  grossPerPeriod,
  payFrequencyLabel,
  payPeriodRange,
  periodsPerYear,
} from '../lib/payrollCalc'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, DateRangeFilter, FilterSelect, ListToolbar } from '../components/ListToolbar'

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
}

const emptyEmployee = {
  first_name: '',
  last_name: '',
  email: '',
  yearly_salary: 0,
  pay_frequency: 'biweekly' as PayFrequency,
  estimated_yearly_income: '',
  active: true,
  hire_date: '',
  notes: '',
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
  }
}

export function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [empOpen, setEmpOpen] = useState(false)
  const [empForm, setEmpForm] = useState(emptyEmployee)
  const [empEditingId, setEmpEditingId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [form, setForm] = useState<PayrollForm | null>(null)
  const [payEditingId, setPayEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
  }

  function openNewEmployee() {
    setEmpForm(emptyEmployee)
    setEmpEditingId(null)
    setEmpOpen(true)
  }

  function openEditEmployee(e: Employee) {
    setEmpForm({
      first_name: e.first_name,
      last_name: e.last_name,
      email: e.email ?? '',
      yearly_salary: Number(e.yearly_salary),
      pay_frequency: e.pay_frequency,
      estimated_yearly_income: e.estimated_yearly_income != null ? String(e.estimated_yearly_income) : '',
      active: e.active,
      hire_date: e.hire_date ?? '',
      notes: e.notes ?? '',
    })
    setEmpEditingId(e.id)
    setEmpOpen(true)
  }

  async function saveEmployee(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      first_name: empForm.first_name,
      last_name: empForm.last_name,
      email: empForm.email || null,
      yearly_salary: empForm.yearly_salary,
      pay_frequency: empForm.pay_frequency,
      estimated_yearly_income: empForm.estimated_yearly_income ? Number(empForm.estimated_yearly_income) : null,
      active: empForm.active,
      hire_date: empForm.hire_date || null,
      notes: empForm.notes || null,
    }
    if (empEditingId) await supabase.from('employees').update(payload).eq('id', empEditingId)
    else await supabase.from('employees').insert(payload)
    setEmpOpen(false)
    load()
  }

  async function removeEmployee(id: string) {
    if (!confirm('Supprimer cet employé ?')) return
    await supabase.from('employees').delete().eq('id', id)
    load()
  }

  function openNewPayroll(emp?: Employee) {
    const target = emp ?? activeEmployees[0]
    if (!target) {
      alert('Ajoutez un employé actif avant de créer une paie.')
      return
    }
    setForm(payrollFormFromEmployee(target))
    setPayEditingId(null)
    setPayOpen(true)
  }

  function openEditPayroll(p: PayrollRun) {
    setForm({
      employee_id: p.employee_id ?? '',
      pay_period_start: p.pay_period_start,
      pay_period_end: p.pay_period_end,
      payment_date: p.payment_date,
      gross_pay: Number(p.gross_pay),
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
    })
    setPayEditingId(p.id)
    setPayOpen(true)
  }

  function recalculateFromSalary() {
    if (!form) return
    const emp = employees.find((e) => e.id === form.employee_id)
    if (!emp) return
    const range = payPeriodRange(form.payment_date, emp.pay_frequency)
    const calc = calculatePayrollDeductions({
      yearlySalary: Number(emp.yearly_salary),
      payFrequency: emp.pay_frequency,
      estimatedYearlyIncome: emp.estimated_yearly_income,
    })
    setForm({
      ...form,
      pay_period_start: range.start,
      pay_period_end: range.end,
      ...calc,
      other_deductions: form.other_deductions,
      employer_benefits: form.employer_benefits,
    })
  }

  function onPayrollEmployeeChange(employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp || !form) return
    setForm(payrollFormFromEmployee(emp, form.payment_date))
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
    const payload = { ...form, net_pay: calcNet(form), employee_id: form.employee_id }
    if (payEditingId) await supabase.from('payroll_runs').update(payload).eq('id', payEditingId)
    else await supabase.from('payroll_runs').insert(payload)
    setPayOpen(false)
    load()
  }

  async function removePayroll(id: string) {
    if (!confirm('Supprimer cette paie ?')) return
    await supabase.from('payroll_runs').delete().eq('id', id)
    load()
  }

  const ytdCost = filtered.reduce((s, p) => s + payrollEmployerTotal(p), 0)
  const selectedEmp = form ? employees.find((e) => e.id === form.employee_id) : null

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Employés</h2>
            <p className="text-sm text-muted">Salaire annuel et fréquence de paie — déductions estimées (QC 2025).</p>
          </div>
          <Button onClick={openNewEmployee}>Nouvel employé</Button>
        </div>
        {employees.length === 0 ? (
          <EmptyState message="Aucun employé — créez le premier pour gérer la paie et le temps." />
        ) : (
          <DataTable minWidth={960}>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Salaire annuel</th>
                  <th className="px-4 py-3">Fréquence</th>
                  <th className="px-4 py-3">Brut / période</th>
                  <th className="px-4 py-3">Revenu estimé (impôts)</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-medium">{employeeDisplayName(e)}</td>
                    <td className="px-4 py-3">{formatCad(e.yearly_salary)}</td>
                    <td className="px-4 py-3 text-muted">{payFrequencyLabel(e.pay_frequency)}</td>
                    <td className="px-4 py-3">{formatCad(grossPerPeriod(Number(e.yearly_salary), e.pay_frequency))}</td>
                    <td className="px-4 py-3 text-muted">
                      {e.estimated_yearly_income != null ? formatCad(e.estimated_yearly_income) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={e.active ? 'actif' : 'inactif'} tone={e.active ? 'active' : 'archived'} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {e.active && (
                        <Button variant="ghost" className={tableActionClass} onClick={() => openNewPayroll(e)}>
                          Paie
                        </Button>
                      )}
                      <Button variant="ghost" className={tableActionClass} onClick={() => openEditEmployee(e)}>
                        Mod.
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => removeEmployee(e.id)}>
                        Suppr.
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
          </DataTable>
        )}
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Paie</h1>
            <p className="text-sm text-muted mt-1">
              Coût employeur total{hasFilters ? ' (filtré)' : ''} : {formatCad(ytdCost)}
            </p>
          </div>
          <Button onClick={() => openNewPayroll()} disabled={activeEmployees.length === 0}>
            Nouvelle paie
          </Button>
        </div>
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
              <ClearFiltersButton
                visible={hasFilters}
                onClick={() => {
                  setSearch('')
                  setEmployeeFilter('')
                  setDateFrom('')
                  setDateTo('')
                }}
              />
            </ListToolbar>
            {filtered.length === 0 ? (
              <EmptyState message="Aucune paie ne correspond aux filtres." />
            ) : (
              <DataTable>
      
                  <thead className="bg-stone-50 text-muted text-left">
                    <tr>
                      <th className="px-4 py-3">Employé</th>
                      <th className="px-4 py-3">Période</th>
                      <th className="px-4 py-3">Brut</th>
                      <th className="px-4 py-3">Net</th>
                      <th className="px-4 py-3">Coût employeur</th>
                      <th className="px-4 py-3">Payé le</th>
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
                        <td className="px-4 py-3">{formatCad(p.net_pay)}</td>
                        <td className="px-4 py-3 font-medium">{formatCad(payrollEmployerTotal(p))}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(p.payment_date)}</td>
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

      <Modal title={empEditingId ? 'Modifier employé' : 'Nouvel employé'} open={empOpen} onClose={() => setEmpOpen(false)} wide>
        <form onSubmit={saveEmployee} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Prénom *">
              <input className={inputClass} required value={empForm.first_name} onChange={(e) => setEmpForm({ ...empForm, first_name: e.target.value })} />
            </Field>
            <Field label="Nom *">
              <input className={inputClass} required value={empForm.last_name} onChange={(e) => setEmpForm({ ...empForm, last_name: e.target.value })} />
            </Field>
          </div>
          <Field label="Courriel">
            <input type="email" className={inputClass} value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Salaire annuel (CAD) *">
              <input type="number" step="0.01" min="0" className={inputClass} required value={empForm.yearly_salary} onChange={(e) => setEmpForm({ ...empForm, yearly_salary: Number(e.target.value) })} />
            </Field>
            <Field label="Fréquence de paie">
              <select className={inputClass} value={empForm.pay_frequency} onChange={(e) => setEmpForm({ ...empForm, pay_frequency: e.target.value as PayFrequency })}>
                <option value="weekly">Hebdomadaire (52×)</option>
                <option value="biweekly">Aux 2 semaines (26×)</option>
                <option value="semimonthly">Bi-mensuel (24×)</option>
                <option value="monthly">Mensuel (12×)</option>
              </select>
            </Field>
          </div>
          <Field label="Revenu annuel estimé pour impôts (optionnel)">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              placeholder="Laisser vide = salaire annuel"
              value={empForm.estimated_yearly_income}
              onChange={(e) => setEmpForm({ ...empForm, estimated_yearly_income: e.target.value })}
            />
            <p className="text-xs text-muted mt-1">
              Utilisez ce champ si l&apos;employé a d&apos;autres revenus — améliore l&apos;estimation des retenues fédérales et provinciales.
            </p>
          </Field>
          {empForm.yearly_salary > 0 && (
            <div className="bg-stone-50 rounded-lg p-3 text-xs text-muted">
              Brut par période :{' '}
              <strong className="text-ink">{formatCad(grossPerPeriod(empForm.yearly_salary, empForm.pay_frequency))}</strong>
              {' · '}
              {periodsPerYear(empForm.pay_frequency)} paies / an
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date d'embauche">
              <input type="date" className={inputClass} value={empForm.hire_date} onChange={(e) => setEmpForm({ ...empForm, hire_date: e.target.value })} />
            </Field>
            <Field label="Statut">
              <select className={inputClass} value={empForm.active ? 'yes' : 'no'} onChange={(e) => setEmpForm({ ...empForm, active: e.target.value === 'yes' })}>
                <option value="yes">Actif</option>
                <option value="no">Inactif</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEmpOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>

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
            <p className="text-xs text-muted font-medium">Déductions employé (estimées — ajustez si besoin)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['federal_tax', 'provincial_tax', 'cpp_employee', 'ei_employee', 'qpip_employee', 'other_deductions'] as const).map((k) => (
                <Field key={k} label={k.replace(/_/g, ' ')}>
                  <input type="number" step="0.01" className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted font-medium">Charges employeur</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['cpp_employer', 'ei_employer', 'qpip_employer', 'employer_benefits'] as const).map((k) => (
                <Field key={k} label={k.replace(/_/g, ' ')}>
                  <input type="number" step="0.01" className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
                </Field>
              ))}
            </div>
            <div className="bg-yuzu-light rounded-lg p-3 text-sm">
              Net estimé : <strong>{formatCad(calcNet(form))}</strong>
              {' · '}
              Coût employeur :{' '}
              <strong>
                {formatCad(
                  payrollEmployerTotal({
                    gross_pay: form.gross_pay,
                    cpp_employer: form.cpp_employer,
                    ei_employer: form.ei_employer,
                    qpip_employer: form.qpip_employer,
                    employer_benefits: form.employer_benefits,
                  })
                )}
              </strong>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
