import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SalesTaxPeriod, TaxPeriodStatus } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

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
  const [rows, setRows] = useState<SalesTaxPeriod[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('sales_tax_periods').select('*').order('period_end', { ascending: false })
    setRows((data as SalesTaxPeriod[]) ?? [])
  }

  async function calculateFromData() {
    const { period_start, period_end } = form
    const [inv, exp] = await Promise.all([
      supabase.from('invoices').select('gst, qst, invoice_date, status').gte('invoice_date', period_start).lte('invoice_date', period_end).neq('status', 'void'),
      supabase.from('expenses').select('gst, qst, expense_date').gte('expense_date', period_start).lte('expense_date', period_end),
    ])
    const gst_collected = (inv.data ?? []).reduce((s, i) => s + Number(i.gst), 0)
    const qst_collected = (inv.data ?? []).reduce((s, i) => s + Number(i.qst), 0)
    const gst_itc = (exp.data ?? []).reduce((s, e) => s + Number(e.gst), 0)
    const qst_itr = (exp.data ?? []).reduce((s, e) => s + Number(e.qst), 0)
    setForm({ ...form, gst_collected, qst_collected, gst_itc, qst_itr })
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const { gst_net, qst_net } = nets(form.gst_collected, form.qst_collected, form.gst_itc, form.qst_itr)
    const payload = {
      ...form,
      filing_due_date: form.filing_due_date || null,
      gst_net,
      qst_net,
      notes: form.notes || null,
    }
    if (editingId) await supabase.from('sales_tax_periods').update(payload).eq('id', editingId)
    else await supabase.from('sales_tax_periods').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Taxes de vente (TPS / TVQ)</h1>
        <Button onClick={openNew}>Nouvelle période</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune déclaration TPS/TVQ." />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                  <td className="px-4 py-3">{formatCad(r.gst_net)}</td>
                  <td className="px-4 py-3">{formatCad(r.qst_net)}</td>
                  <td className="px-4 py-3"><Badge label={r.status} tone={r.status} /></td>
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
      <Modal title="Période TPS/TVQ" open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Début"><input type="date" className={inputClass} required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></Field>
            <Field label="Fin"><input type="date" className={inputClass} required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></Field>
            <Field label="Échéance dépôt"><input type="date" className={inputClass} value={form.filing_due_date} onChange={(e) => setForm({ ...form, filing_due_date: e.target.value })} /></Field>
          </div>
          <Button type="button" variant="secondary" onClick={calculateFromData}>Calculer depuis factures et dépenses</Button>
          <div className="grid grid-cols-2 gap-3">
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
    </div>
  )
}
