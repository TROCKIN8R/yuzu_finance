import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CorporateTaxRecord, CorpTaxStatus } from '../lib/types'
import { formatCad, formatDate } from '../lib/format'
import { matchesSearch } from '../lib/filters'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, FilterSelect, ListToolbar } from '../components/ListToolbar'

const empty = {
  fiscal_year: '2025-2026',
  label: '',
  tax_authority: 'CRA',
  due_date: '',
  amount: 0,
  paid_amount: 0,
  paid_date: '',
  status: 'estimated' as CorpTaxStatus,
  notes: '',
}

export function CorporateTaxPage() {
  const [rows, setRows] = useState<CorporateTaxRecord[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fiscalYearFilter, setFiscalYearFilter] = useState('')

  const fiscalYears = useMemo(
    () => [...new Set(rows.map((r) => r.fiscal_year))].sort().reverse(),
    [rows]
  )

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (fiscalYearFilter && r.fiscal_year !== fiscalYearFilter) return false
      return matchesSearch(search, r.fiscal_year, r.label, r.tax_authority, r.status, r.amount, r.notes)
    })
  }, [rows, search, statusFilter, fiscalYearFilter])

  const hasFilters = !!(search || statusFilter || fiscalYearFilter)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('corporate_tax_records').select('*').order('due_date', { ascending: true })
    setRows((data as CorporateTaxRecord[]) ?? [])
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(r: CorporateTaxRecord) {
    setForm({
      fiscal_year: r.fiscal_year,
      label: r.label,
      tax_authority: r.tax_authority,
      due_date: r.due_date ?? '',
      amount: Number(r.amount),
      paid_amount: Number(r.paid_amount),
      paid_date: r.paid_date ?? '',
      status: r.status,
      notes: r.notes ?? '',
    })
    setEditingId(r.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      ...form,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      notes: form.notes || null,
    }
    if (editingId) await supabase.from('corporate_tax_records').update(payload).eq('id', editingId)
    else await supabase.from('corporate_tax_records').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet enregistrement ?')) return
    await supabase.from('corporate_tax_records').delete().eq('id', id)
    load()
  }

  const due = filtered.filter((r) => r.status !== 'paid').reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Impôts société</h1>
          <p className="text-sm text-muted mt-1">
            Solde dû{hasFilters ? ' (filtré)' : ''} : {formatCad(due)}
          </p>
        </div>
        <Button onClick={openNew}>Nouveau</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucun impôt société enregistré (T2, CO-17, acomptes)." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Description, autorité…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterSelect
              label="Année fiscale"
              value={fiscalYearFilter}
              onChange={setFiscalYearFilter}
              options={[{ value: '', label: 'Toutes' }, ...fiscalYears.map((y) => ({ value: y, label: y }))]}
            />
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'estimated', label: 'estimated' },
                { value: 'due', label: 'due' },
                { value: 'paid', label: 'paid' },
              ]}
            />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setStatusFilter('')
                setFiscalYearFilter('')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucun enregistrement ne correspond aux filtres." />
          ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3">Année fiscale</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Autorité</th>
                <th className="px-4 py-3">Échéance</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.fiscal_year}</td>
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3 text-muted">{r.tax_authority}</td>
                  <td className="px-4 py-3">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                  <td className="px-4 py-3">{formatCad(r.amount)}</td>
                  <td className="px-4 py-3"><Badge label={r.status} tone={r.status === 'paid' ? 'paid' : 'draft'} /></td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(r)}>Mod.</Button>
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => remove(r.id)}>Suppr.</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
      <Modal title="Impôt société" open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Année fiscale *"><input className={inputClass} required value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} placeholder="2025-2026" /></Field>
            <Field label="Autorité"><select className={inputClass} value={form.tax_authority} onChange={(e) => setForm({ ...form, tax_authority: e.target.value })}><option>CRA</option><option>RQ</option></select></Field>
          </div>
          <Field label="Description *"><input className={inputClass} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Acompte T2 Q1" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Échéance"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Montant *"><input type="number" step="0.01" className={inputClass} required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
            <Field label="Payé"><input type="number" step="0.01" className={inputClass} value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Statut">
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CorpTaxStatus })}>
              <option value="estimated">estimated</option><option value="due">due</option><option value="paid">paid</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
