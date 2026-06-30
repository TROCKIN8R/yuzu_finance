import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SalesTaxPeriod, TaxPeriodStatus } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { matchesSearch, countActiveFilters } from '../lib/filters'
import { calculateSalesTaxPeriod } from '../lib/salesTaxCalc'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'

const empty = {
  period_start: todayIso().slice(0, 8) + '01',
  period_end: todayIso(),
  filing_due_date: '',
  gst_collected: 0,
  qst_collected: 0,
  gst_itc: 0,
  qst_itr: 0,
  status: 'open' as TaxPeriodStatus,
  notes: '',
}

function nets(gstC: number, qstC: number, gstI: number, qstI: number) {
  return { gst_net: gstC - gstI, qst_net: qstC - qstI }
}

export function SalesTaxPage() {
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<SalesTaxPeriod[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      return matchesSearch(search, r.period_start, r.period_end, r.status, r.gst_net, r.qst_net, r.notes)
    })
  }, [rows, search, statusFilter])

  const hasFilters = !!(search || statusFilter)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('sales_tax_periods').select('*').order('period_end', { ascending: false })
    setRows((data as SalesTaxPeriod[]) ?? [])
  }

  async function calculateFromData() {
    const totals = await fetchPeriodTotals(form.period_start, form.period_end)
    setForm({ ...form, ...totals })
  }

  async function fetchPeriodTotals(periodStart: string, periodEnd: string) {
    const [inv, exp, ee] = await Promise.all([
      supabase.from('invoices').select('gst, qst, invoice_date, status').gte('invoice_date', periodStart).lte('invoice_date', periodEnd),
      supabase.from('expenses').select('gst, qst, expense_date, category, payroll_run_id').gte('expense_date', periodStart).lte('expense_date', periodEnd),
      supabase.from('employee_expenses').select('gst, qst, expense_date, taxable, payroll_run_id').gte('expense_date', periodStart).lte('expense_date', periodEnd),
    ])
    return calculateSalesTaxPeriod(periodStart, periodEnd, inv.data ?? [], exp.data ?? [], ee.data ?? [])
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.period_start, prior?.period_end, form.period_start, form.period_end)) return
    const totals = await fetchPeriodTotals(form.period_start, form.period_end)
    const { gst_net, qst_net } = nets(totals.gst_collected, totals.qst_collected, totals.gst_itc, totals.qst_itr)
    const payload = {
      ...form,
      ...totals,
      gst_net,
      qst_net,
      filing_due_date: form.filing_due_date || null,
      notes: form.notes || null,
      auto_synced_at: new Date().toISOString(),
    }
    if (editingId) await supabase.from('sales_tax_periods').update(payload).eq('id', editingId)
    else await supabase.from('sales_tax_periods').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row && blockIfClosed(row.period_start, row.period_end)) return
    if (!confirm('Supprimer cette période ?')) return
    await supabase.from('sales_tax_periods').delete().eq('id', id)
    load()
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(r: SalesTaxPeriod) {
    setForm({
      period_start: r.period_start,
      period_end: r.period_end,
      filing_due_date: r.filing_due_date ?? '',
      gst_collected: Number(r.gst_collected),
      qst_collected: Number(r.qst_collected),
      gst_itc: Number(r.gst_itc),
      qst_itr: Number(r.qst_itr),
      status: r.status,
      notes: r.notes ?? '',
    })
    setEditingId(r.id)
    setOpen(true)
  }

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Taxes de vente (TPS / TVQ)"
        subtitle="Périodes trimestrielles, CTI/RTI et remises."
        actions={<Button onClick={openNew}>Nouvelle période</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState message="Aucune déclaration TPS/TVQ." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Période, montants…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, !!statusFilter)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('')
            }}
          >
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'open', label: 'Ouverte' },
                { value: 'filed', label: 'Déposée' },
                { value: 'paid', label: 'Payée' },
              ]}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune période ne correspond aux filtres." />
          ) : (
        <DataTable>

            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3">Période</th>
                <th className="px-4 py-3">TPS nette</th>
                <th className="px-4 py-3">TVQ nette</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                  <td className="px-4 py-3">{formatCad(r.gst_net)}</td>
                  <td className="px-4 py-3">{formatCad(r.qst_net)}</td>
                  <td className="px-4 py-3"><Badge label={r.status} tone={r.status} /></td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(r)}>Mod.</Button>
                    <Button variant="danger" className={tableActionClass} onClick={() => remove(r.id)}>Suppr.</Button>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
          )}
        </>
      )}
      <Modal title="Période TPS/TVQ" open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Début"><input type="date" className={inputClass} required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></Field>
            <Field label="Fin"><input type="date" className={inputClass} required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></Field>
            <Field label="Échéance dépôt"><input type="date" className={inputClass} value={form.filing_due_date} onChange={(e) => setForm({ ...form, filing_due_date: e.target.value })} /></Field>
          </div>
          <Button type="button" variant="secondary" onClick={calculateFromData}>Calculer depuis factures et dépenses</Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="TPS perçue"><input type="number" step="0.01" className={inputClass} value={form.gst_collected} onChange={(e) => setForm({ ...form, gst_collected: Number(e.target.value) })} /></Field>
            <Field label="TVQ perçue"><input type="number" step="0.01" className={inputClass} value={form.qst_collected} onChange={(e) => setForm({ ...form, qst_collected: Number(e.target.value) })} /></Field>
            <Field label="CTI / TPS"><input type="number" step="0.01" className={inputClass} value={form.gst_itc} onChange={(e) => setForm({ ...form, gst_itc: Number(e.target.value) })} /></Field>
            <Field label="RTI / TVQ"><input type="number" step="0.01" className={inputClass} value={form.qst_itr} onChange={(e) => setForm({ ...form, qst_itr: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Statut">
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaxPeriodStatus })}>
              <option value="open">open</option><option value="filed">filed</option><option value="paid">paid</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
