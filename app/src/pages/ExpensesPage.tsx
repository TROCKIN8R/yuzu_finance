import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Expense, ExpenseCategory } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, DateRangeFilter, FilterSelect, ListToolbar } from '../components/ListToolbar'

const CATEGORIES: ExpenseCategory[] = ['software', 'office', 'travel', 'professional', 'marketing', 'payroll', 'other']

const empty = {
  expense_date: todayIso(),
  vendor: '',
  category: 'other' as ExpenseCategory,
  description: '',
  amount: 0,
  gst: 0,
  qst: 0,
  paid: true,
  notes: '',
}

export function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [paidFilter, setPaidFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((e) => {
      if (categoryFilter && e.category !== categoryFilter) return false
      if (paidFilter === 'yes' && !e.paid) return false
      if (paidFilter === 'no' && e.paid) return false
      if (!inDateRange(e.expense_date, dateFrom, dateTo)) return false
      return matchesSearch(search, e.vendor, e.description, e.category, e.notes, e.total)
    })
  }, [rows, search, categoryFilter, paidFilter, dateFrom, dateTo])

  const hasFilters = !!(search || categoryFilter || paidFilter || dateFrom || dateTo)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    setRows((data as Expense[]) ?? [])
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(e: Expense) {
    setForm({
      expense_date: e.expense_date,
      vendor: e.vendor,
      category: e.category,
      description: e.description ?? '',
      amount: Number(e.amount),
      gst: Number(e.gst),
      qst: Number(e.qst),
      paid: e.paid,
      notes: e.notes ?? '',
    })
    setEditingId(e.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const total = form.amount + form.gst + form.qst
    const payload = {
      expense_date: form.expense_date,
      vendor: form.vendor,
      category: form.category,
      description: form.description || null,
      amount: form.amount,
      gst: form.gst,
      qst: form.qst,
      total,
      paid: form.paid,
      notes: form.notes || null,
    }
    if (editingId) await supabase.from('expenses').update(payload).eq('id', editingId)
    else await supabase.from('expenses').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette dépense ?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  const total = filtered.reduce((s, e) => s + Number(e.total), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Dépenses</h1>
          <p className="text-sm text-muted mt-1">
            Total{hasFilters ? ' (filtré)' : ''} : {formatCad(total)}
          </p>
        </div>
        <Button onClick={openNew}>Nouvelle dépense</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune dépense enregistrée." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Fournisseur, description…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterSelect
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[{ value: '', label: 'Toutes' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
            <FilterSelect
              label="Payé"
              value={paidFilter}
              onChange={setPaidFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'yes', label: 'Oui' },
                { value: 'no', label: 'Non' },
              ]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setCategoryFilter('')
                setPaidFilter('')
                setDateFrom('')
                setDateTo('')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune dépense ne correspond aux filtres." />
          ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Fournisseur</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">TPS/TVQ</th>
                <th className="px-4 py-3">Payé</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">{formatDate(e.expense_date)}</td>
                  <td className="px-4 py-3 font-medium">{e.vendor}</td>
                  <td className="px-4 py-3"><Badge label={e.category} /></td>
                  <td className="px-4 py-3">{formatCad(e.total)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatCad(e.gst)} / {formatCad(e.qst)}</td>
                  <td className="px-4 py-3">{e.paid ? 'Oui' : 'Non'}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(e)}>Mod.</Button>
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => remove(e.id)}>Suppr.</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
      <Modal title={editingId ? 'Modifier dépense' : 'Nouvelle dépense'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *"><input type="date" className={inputClass} required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="Fournisseur *"><input className={inputClass} required value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
          </div>
          <Field label="Catégorie">
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Montant HT *"><input type="number" step="0.01" min="0" className={inputClass} required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
            <Field label="TPS"><input type="number" step="0.01" min="0" className={inputClass} value={form.gst} onChange={(e) => setForm({ ...form, gst: Number(e.target.value) })} /></Field>
            <Field label="TVQ"><input type="number" step="0.01" min="0" className={inputClass} value={form.qst} onChange={(e) => setForm({ ...form, qst: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Payé">
            <select className={inputClass} value={form.paid ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, paid: e.target.value === 'yes' })}>
              <option value="yes">Oui</option><option value="no">Non (à payer)</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
