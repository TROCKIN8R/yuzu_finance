import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Employee, EmployeeExpense, ExpenseCategory, OrganizationSettings } from '../lib/types'
import { formatCad, formatDate, relationOne, todayIso } from '../lib/format'
import { inDateRange, matchesSearch, countActiveFilters } from '../lib/filters'
import { computePurchaseTaxesFromTotal } from '../lib/taxes'
import { employeeDisplayName } from '../lib/payrollCalc'
import { EXPENSE_CATEGORY_LABELS } from '../lib/chartOfAccounts'
import { deleteEntityDocuments } from '../lib/documents'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { DocumentAttachments } from '../components/DocumentAttachments'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { DateRangeFilter, FilterChips, FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'

const CATEGORIES: ExpenseCategory[] = ['software', 'office', 'travel', 'professional', 'marketing', 'other']

function round2(n: number) {
  return Math.round(n * 100) / 100
}

type Filter = 'all' | 'unreimbursed' | 'reimbursed'

const empty = {
  employee_id: '',
  expense_date: todayIso(),
  vendor: '',
  category: 'other' as ExpenseCategory,
  description: '',
  total: 0,
  amount: 0,
  gst: 0,
  qst: 0,
  applyTax: true,
  taxable: false,
  notes: '',
}

export function EmployeeExpensesPage() {
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<EmployeeExpense[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Filter>('all')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])
  const defaultEmployeeId = activeEmployees.length === 1 ? activeEmployees[0].id : ''

  const filtered = useMemo(() => {
    return rows.filter((e) => {
      if (statusFilter === 'unreimbursed' && e.payroll_run_id) return false
      if (statusFilter === 'reimbursed' && !e.payroll_run_id) return false
      if (employeeFilter && e.employee_id !== employeeFilter) return false
      if (categoryFilter && e.category !== categoryFilter) return false
      if (!inDateRange(e.expense_date, dateFrom, dateTo)) return false
      const emp = relationOne(e.employees)
      return matchesSearch(
        search,
        e.vendor,
        e.description,
        e.category,
        e.notes,
        e.total,
        emp ? employeeDisplayName(emp) : ''
      )
    })
  }, [rows, search, statusFilter, employeeFilter, categoryFilter, dateFrom, dateTo])

  const hasFilters = !!(search || statusFilter !== 'all' || employeeFilter || categoryFilter || dateFrom || dateTo)
  const unreimbursedTotal = rows.filter((e) => !e.payroll_run_id).reduce((s, e) => s + Number(e.total), 0)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [{ data }, { data: emp }, { data: set }] = await Promise.all([
      supabase
        .from('employee_expenses')
        .select('*, employees(first_name, last_name), payroll_runs(payment_date)')
        .order('expense_date', { ascending: false }),
      supabase.from('employees').select('*').eq('active', true).order('last_name').order('first_name'),
      supabase.from('organization_settings').select('*').maybeSingle(),
    ])
    setRows((data as EmployeeExpense[]) ?? [])
    setEmployees((emp as Employee[]) ?? [])
    setSettings(set.data)
  }

  function recalcExpenseTaxes(total: number, applyTax: boolean) {
    if (!settings || !applyTax) {
      return { amount: round2(total), gst: 0, qst: 0, total: round2(total) }
    }
    const t = computePurchaseTaxesFromTotal(total, settings)
    return { amount: t.subtotal, gst: t.gst, qst: t.qst, total: t.total }
  }

  function onTotalChange(total: number) {
    const taxes = recalcExpenseTaxes(total, form.applyTax)
    setForm({ ...form, ...taxes })
  }

  function onTaxToggle(applyTax: boolean) {
    const taxes = recalcExpenseTaxes(form.total, applyTax)
    setForm({ ...form, applyTax, ...taxes })
  }

  function openNew() {
    setForm({ ...empty, employee_id: defaultEmployeeId })
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(e: EmployeeExpense) {
    if (e.payroll_run_id) {
      alert('Frais déjà remboursé — modification limitée.')
      return
    }
    setForm({
      employee_id: e.employee_id,
      expense_date: e.expense_date,
      vendor: e.vendor,
      category: e.category,
      description: e.description ?? '',
      total: Number(e.total),
      amount: Number(e.amount),
      gst: Number(e.gst),
      qst: Number(e.qst),
      applyTax: Number(e.gst) > 0 || Number(e.qst) > 0,
      taxable: e.taxable,
      notes: e.notes ?? '',
    })
    setEditingId(e.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form.employee_id) {
      alert('Sélectionnez un employé.')
      return
    }
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.expense_date, form.expense_date)) return
    const amount = form.applyTax ? form.amount : round2(form.total)
    const gst = form.applyTax ? form.gst : 0
    const qst = form.applyTax ? form.qst : 0
    const total = form.applyTax ? form.total : amount
    const payload = {
      employee_id: form.employee_id,
      expense_date: form.expense_date,
      vendor: form.vendor,
      category: form.category,
      description: form.description || null,
      amount,
      gst,
      qst,
      total,
      taxable: form.taxable,
      notes: form.notes || null,
    }
    if (editingId) {
      await supabase.from('employee_expenses').update(payload).eq('id', editingId)
      setOpen(false)
    } else {
      const { data, error } = await supabase.from('employee_expenses').insert(payload).select('id').single()
      if (error) {
        alert(error.message)
        return
      }
      setEditingId(data.id)
    }
    load()
  }

  async function remove(e: EmployeeExpense) {
    if (e.payroll_run_id) {
      alert('Impossible de supprimer un frais déjà remboursé.')
      return
    }
    if (!confirm('Supprimer ce frais ?')) return
    if (blockIfClosed(e.expense_date)) return
    await deleteEntityDocuments('employee_expense', e.id)
    await supabase.from('employee_expenses').delete().eq('id', e.id)
    load()
  }

  const total = filtered.reduce((s, e) => s + Number(e.total), 0)

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Frais à rembourser"
        subtitle={
          <>
            Dépenses payées personnellement — incluses lors d&apos;une{' '}
            <Link to="/compensation/payroll" className="text-yuzu-dark hover:underline font-medium">
              paie
            </Link>
            .
            {unreimbursedTotal > 0 && (
              <> En attente : <strong>{formatCad(unreimbursedTotal)}</strong></>
            )}
            {' · '}
            Total{hasFilters ? ' (filtré)' : ''} : {formatCad(total)}
          </>
        }
        actions={
          <Button onClick={openNew} disabled={activeEmployees.length === 0}>
            Nouveau frais
          </Button>
        }
      />

      {activeEmployees.length === 0 ? (
        <EmptyState message="Ajoutez un employé actif (page Paie) avant d'enregistrer des frais." />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucun frais enregistré — ajoutez une dépense payée de votre poche." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Fournisseur, description…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(
              !!search,
              statusFilter !== 'all',
              !!employeeFilter,
              !!categoryFilter,
              !!dateFrom,
              !!dateTo
            )}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('all')
              setEmployeeFilter('')
              setCategoryFilter('')
              setDateFrom('')
              setDateTo('')
            }}
          >
            <FilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'unreimbursed', label: 'À rembourser' },
                { value: 'reimbursed', label: 'Remboursé' },
              ]}
            />
            <FilterSelect
              label="Employé"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: '', label: 'Tous' },
                ...activeEmployees.map((e) => ({ value: e.id, label: employeeDisplayName(e) })),
              ]}
            />
            <FilterSelect
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Toutes' },
                ...CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] })),
              ]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </ListToolbar>

          {filtered.length === 0 ? (
            <EmptyState message="Aucun frais ne correspond aux filtres." />
          ) : (
            <DataTable>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employé</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Imposable</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => {
                  const emp = relationOne(e.employees)
                  const pay = relationOne(e.payroll_runs)
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3">{emp ? employeeDisplayName(emp) : '—'}</td>
                      <td className="px-4 py-3 font-medium">{e.vendor}</td>
                      <td className="px-4 py-3">
                        <Badge label={EXPENSE_CATEGORY_LABELS[e.category] ?? e.category} />
                      </td>
                      <td className="px-4 py-3">{formatCad(e.total)}</td>
                      <td className="px-4 py-3">{e.taxable ? 'Oui' : 'Non'}</td>
                      <td className="px-4 py-3">
                        {e.payroll_run_id ? (
                          <Badge label={pay ? `Paie ${formatDate(pay.payment_date)}` : 'Remboursé'} tone="active" />
                        ) : (
                          <Badge label="À rembourser" tone="draft" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(e)}>
                          Mod.
                        </Button>
                        <Button variant="danger" className={tableActionClass} onClick={() => remove(e)}>
                          Suppr.
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      <Modal title={editingId ? 'Modifier frais' : 'Nouveau frais'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <Field label="Employé *">
            <select
              className={inputClass}
              required
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            >
              <option value="">—</option>
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeDisplayName(e)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date *">
              <input
                type="date"
                className={inputClass}
                required
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </Field>
            <Field label="Fournisseur *">
              <input
                className={inputClass}
                required
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Catégorie">
            <select
              className={inputClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.applyTax} onChange={(e) => onTaxToggle(e.target.checked)} />
            Calculer TPS/TVQ (Québec) à partir du total TTC
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Total TTC *">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                required
                value={form.total}
                onChange={(e) => onTotalChange(Number(e.target.value))}
              />
            </Field>
            <Field label="Montant HT">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="TPS (CTI)">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={form.gst}
                onChange={(e) => setForm({ ...form, gst: Number(e.target.value) })}
              />
            </Field>
            <Field label="TVQ (RTI)">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={form.qst}
                onChange={(e) => setForm({ ...form, qst: Number(e.target.value) })}
              />
            </Field>
          </div>
          {settings && form.applyTax && (
            <p className="text-xs text-muted">
              TPS {Math.round(settings.gst_rate * 10000) / 100}% · TVQ {Math.round(settings.qst_rate * 10000) / 100}% sur HT+TPS
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.taxable}
              onChange={(e) => setForm({ ...form, taxable: e.target.checked })}
            />
            Remboursement imposable (ajouté au brut de paie)
          </label>
          {!form.taxable && (
            <p className="text-xs text-muted">
              Par défaut, le remboursement est non imposable et s&apos;ajoute au net de paie uniquement.
            </p>
          )}
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DocumentAttachments
            entityType="employee_expense"
            entityId={editingId}
            disabled={!!(editingId && rows.find((r) => r.id === editingId)?.payroll_run_id)}
            label="Reçu / facture employé"
            hint="Photo ou PDF du reçu soumis par l'employé."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
