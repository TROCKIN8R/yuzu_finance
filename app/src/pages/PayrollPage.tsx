import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PayrollRun } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import { payrollEmployerTotal } from '../lib/financials'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, DateRangeFilter, ListToolbar } from '../components/ListToolbar'

type PayrollForm = {
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

const emptyForm = {
  pay_period_start: todayIso(),
  pay_period_end: todayIso(),
  payment_date: todayIso(),
  gross_pay: 0,
  federal_tax: 0,
  provincial_tax: 0,
  cpp_employee: 0,
  ei_employee: 0,
  qpip_employee: 0,
  cpp_employer: 0,
  ei_employer: 0,
  qpip_employer: 0,
  other_deductions: 0,
  employer_benefits: 0,
  notes: '',
}

export function PayrollPage() {
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (!inDateRange(p.payment_date, dateFrom, dateTo)) return false
      return matchesSearch(
        search,
        p.notes,
        p.gross_pay,
        p.net_pay,
        p.pay_period_start,
        p.pay_period_end,
        p.payment_date
      )
    })
  }, [rows, search, dateFrom, dateTo])

  const hasFilters = !!(search || dateFrom || dateTo)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('payroll_runs').select('*').order('payment_date', { ascending: false })
    setRows((data as PayrollRun[]) ?? [])
  }

  function openNew() {
    setForm(emptyForm)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(p: PayrollRun) {
    setForm({
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
    setEditingId(p.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = { ...form, net_pay: calcNet(form) }
    if (editingId) await supabase.from('payroll_runs').update(payload).eq('id', editingId)
    else await supabase.from('payroll_runs').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette paie ?')) return
    await supabase.from('payroll_runs').delete().eq('id', id)
    load()
  }

  const ytdCost = filtered.reduce((s, p) => s + payrollEmployerTotal(p), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Paie — employé</h1>
          <p className="text-sm text-muted mt-1">
            Coût employeur total{hasFilters ? ' (filtré)' : ''} : {formatCad(ytdCost)}
          </p>
        </div>
        <Button onClick={openNew}>Nouvelle paie</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune paie enregistrée." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Période, montants, notes…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setDateFrom('')
                setDateTo('')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune paie ne correspond aux filtres." />
          ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
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
                  <td className="px-4 py-3">{formatDate(p.pay_period_start)} – {formatDate(p.pay_period_end)}</td>
                  <td className="px-4 py-3">{formatCad(p.gross_pay)}</td>
                  <td className="px-4 py-3">{formatCad(p.net_pay)}</td>
                  <td className="px-4 py-3 font-medium">{formatCad(payrollEmployerTotal(p))}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(p)}>Mod.</Button>
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => remove(p.id)}>Suppr.</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
      <Modal title={editingId ? 'Modifier paie' : 'Nouvelle paie'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Début période"><input type="date" className={inputClass} required value={form.pay_period_start} onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })} /></Field>
            <Field label="Fin période"><input type="date" className={inputClass} required value={form.pay_period_end} onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })} /></Field>
            <Field label="Date paiement"><input type="date" className={inputClass} required value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></Field>
          </div>
          <Field label="Salaire brut *"><input type="number" step="0.01" className={inputClass} required value={form.gross_pay} onChange={(e) => setForm({ ...form, gross_pay: Number(e.target.value) })} /></Field>
          <p className="text-xs text-muted font-medium">Déductions employé</p>
          <div className="grid grid-cols-3 gap-3">
            {(['federal_tax', 'provincial_tax', 'cpp_employee', 'ei_employee', 'qpip_employee', 'other_deductions'] as const).map((k) => (
              <Field key={k} label={k.replace(/_/g, ' ')}>
                <input type="number" step="0.01" className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted font-medium">Charges employeur</p>
          <div className="grid grid-cols-4 gap-3">
            {(['cpp_employer', 'ei_employer', 'qpip_employer', 'employer_benefits'] as const).map((k) => (
              <Field key={k} label={k.replace(/_/g, ' ')}>
                <input type="number" step="0.01" className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <div className="bg-yuzu-light rounded-lg p-3 text-sm">
            Net estimé : <strong>{formatCad(calcNet(form))}</strong> · Coût employeur : <strong>{formatCad(payrollEmployerTotal({ gross_pay: form.gross_pay, cpp_employer: form.cpp_employer, ei_employer: form.ei_employer, qpip_employer: form.qpip_employer, employer_benefits: form.employer_benefits }))}</strong>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
