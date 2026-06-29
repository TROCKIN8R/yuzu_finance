import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Employee, Shareholder } from '../lib/types'
import { formatCad } from '../lib/format'
import { employeeDisplayName } from '../lib/payrollCalc'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { AlertBanner } from '../components/AlertBanner'

type CompensationOutletContext = { refreshMetrics?: () => void }

const emptyShareholder = {
  legal_name: '',
  email: '',
  employee_id: '',
  shares_held: 1,
  active: true,
  notes: '',
}

export function ShareholdersPage() {
  const { refreshMetrics } = useOutletContext<CompensationOutletContext>() ?? {}
  const [rows, setRows] = useState<Shareholder[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyShareholder)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoadError(null)
    const [sh, emp] = await Promise.all([
      supabase.from('shareholders').select('*, employees(first_name, last_name)').order('legal_name'),
      supabase.from('employees').select('id, first_name, last_name, active').eq('active', true).order('last_name'),
    ])
    if (sh.error?.message.includes('shareholders')) {
      setLoadError('Table shareholders manquante — exécutez la migration 20260628140000_shareholders.sql.')
      setRows([])
    } else {
      setRows((sh.data as Shareholder[]) ?? [])
    }
    setEmployees((emp.data as Employee[]) ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    setForm(emptyShareholder)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(s: Shareholder) {
    setForm({
      legal_name: s.legal_name,
      email: s.email ?? '',
      employee_id: s.employee_id ?? '',
      shares_held: Number(s.shares_held),
      active: s.active,
      notes: s.notes ?? '',
    })
    setEditingId(s.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      legal_name: form.legal_name,
      email: form.email || null,
      employee_id: form.employee_id || null,
      shares_held: form.shares_held,
      active: form.active,
      notes: form.notes || null,
    }
    if (editingId) await supabase.from('shareholders').update(payload).eq('id', editingId)
    else await supabase.from('shareholders').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet actionnaire ?')) return
    await supabase.from('shareholders').delete().eq('id', id)
    load()
  }

  const activeCount = rows.filter((s) => s.active).length

  return (
    <>
      <PageHeader
        title="Actionnaires"
        subtitle="Registre des actionnaires — les dividendes sont répartis selon les actions détenues."
        actions={<Button onClick={openNew}>Ajouter</Button>}
      />

      {loadError && <AlertBanner>{loadError}</AlertBanner>}

      {activeCount === 0 && !loadError && (
        <AlertBanner>
          Aucun actionnaire actif — ajoutez au moins l&apos;actionnaire principal avant de déclarer des dividendes.
        </AlertBanner>
      )}

      {rows.length === 0 ? (
        <EmptyState message="Aucun actionnaire enregistré." />
      ) : (
        <DataTable>
          <thead className="bg-stone-50 text-muted text-left">
            <tr>
              <th className="px-4 py-3">Nom légal</th>
              <th className="px-4 py-3">Actions</th>
              <th className="px-4 py-3">Employé lié</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">{s.legal_name}</td>
                <td className="px-4 py-3">{Number(s.shares_held)}</td>
                <td className="px-4 py-3 text-muted">
                  {s.employees ? employeeDisplayName(s.employees) : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge label={s.active ? 'Actif' : 'Inactif'} tone={s.active ? 'paid' : 'draft'} />
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(s)}>
                    Modifier
                  </Button>
                  <Button variant="danger" className={tableActionClass} onClick={() => remove(s.id)}>
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title={editingId ? 'Modifier actionnaire' : 'Nouvel actionnaire'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <Field label="Nom légal *">
            <input className={inputClass} required value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </Field>
          <Field label="Courriel">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Actions détenues *">
            <input type="number" step="0.0001" min="0.0001" className={inputClass} required value={form.shares_held} onChange={(e) => setForm({ ...form, shares_held: Number(e.target.value) })} />
          </Field>
          <Field label="Employé lié (optionnel)">
            <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeDisplayName(e)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Actif
          </label>
          <Field label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      <p className="text-xs text-muted mt-4">
        Brouillon pour révision CPA — les dividendes doivent correspondre au registre des actionnaires et aux T5/RL-3.
      </p>
    </>
  )
}
