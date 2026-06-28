import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Employee, PayFrequency } from '../lib/types'
import { formatCad } from '../lib/format'
import { employeeDisplayName, grossPerPeriod, payFrequencyLabel, periodsPerYear } from '../lib/payrollCalc'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

type CompensationOutletContext = { refreshMetrics?: () => void }

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

export function EmployeesPage() {
  const { refreshMetrics } = useOutletContext<CompensationOutletContext>() ?? {}
  const [employees, setEmployees] = useState<Employee[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyEmployee)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase.from('employees').select('*').order('last_name').order('first_name')
    setEmployees((data as Employee[]) ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    setForm(emptyEmployee)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(e: Employee) {
    setForm({
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
    setEditingId(e.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      yearly_salary: form.yearly_salary,
      pay_frequency: form.pay_frequency,
      estimated_yearly_income: form.estimated_yearly_income ? Number(form.estimated_yearly_income) : null,
      active: form.active,
      hire_date: form.hire_date || null,
      notes: form.notes || null,
    }
    if (editingId) await supabase.from('employees').update(payload).eq('id', editingId)
    else await supabase.from('employees').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet employé ?')) return
    await supabase.from('employees').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Employés"
        subtitle={
          <>
            Fiche salariale requise pour la paie, le temps et les dividendes.{' '}
            <Link to="/compensation/payroll" className="text-yuzu-dark hover:underline">
              ← Retour à la rémunération
            </Link>
          </>
        }
        actions={<Button onClick={openNew}>Nouvel employé</Button>}
      />

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
                  <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(e)}>
                    Mod.
                  </Button>
                  <Button variant="danger" className={tableActionClass} onClick={() => remove(e.id)}>
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title={editingId ? 'Modifier employé' : 'Nouvel employé'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Prénom *">
              <input className={inputClass} required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Nom *">
              <input className={inputClass} required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
          </div>
          <Field label="Courriel">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Salaire annuel (CAD) *">
              <input type="number" step="0.01" min="0" className={inputClass} required value={form.yearly_salary} onChange={(e) => setForm({ ...form, yearly_salary: Number(e.target.value) })} />
            </Field>
            <Field label="Fréquence de paie">
              <select className={inputClass} value={form.pay_frequency} onChange={(e) => setForm({ ...form, pay_frequency: e.target.value as PayFrequency })}>
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
              value={form.estimated_yearly_income}
              onChange={(e) => setForm({ ...form, estimated_yearly_income: e.target.value })}
            />
            <p className="text-xs text-muted mt-1">
              Utilisez ce champ si l&apos;employé a d&apos;autres revenus — améliore l&apos;estimation des retenues fédérales et provinciales.
            </p>
          </Field>
          {form.yearly_salary > 0 && (
            <div className="bg-stone-50 rounded-lg p-3 text-xs text-muted">
              Brut par période :{' '}
              <strong className="text-ink">{formatCad(grossPerPeriod(form.yearly_salary, form.pay_frequency))}</strong>
              {' · '}
              {periodsPerYear(form.pay_frequency)} paies / an
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date d'embauche">
              <input type="date" className={inputClass} value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            </Field>
            <Field label="Statut">
              <select className={inputClass} value={form.active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}>
                <option value="yes">Actif</option>
                <option value="no">Inactif</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
