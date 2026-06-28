import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, TimeEntry } from '../lib/types'
import { effectiveRate, formatCad, formatDate, lineAmount, relationOne, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, DateRangeFilter, FilterChips, FilterSelect, ListToolbar } from '../components/ListToolbar'

type Filter = 'all' | 'unbilled' | 'invoiced'

export function TimePage() {
  const [rows, setRows] = useState<TimeEntry[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [billingFilter, setBillingFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    project_id: '',
    entry_date: todayIso(),
    hours: 1,
    description: '',
    billable: true,
    rate_override: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  const clientOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of allProjects) {
      if (p.clients?.legal_name) names.set(p.client_id, p.clients.legal_name)
    }
    return [...names.entries()].map(([id, label]) => ({ value: id, label }))
  }, [allProjects])

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      const proj = relationOne(t.projects)
      if (billingFilter === 'unbilled' && t.invoice_id) return false
      if (billingFilter === 'invoiced' && !t.invoice_id) return false
      if (projectFilter && t.project_id !== projectFilter) return false
      if (clientFilter && proj?.client_id !== clientFilter) return false
      if (!inDateRange(t.entry_date, dateFrom, dateTo)) return false
      const inv = relationOne((t as TimeEntry & { invoices?: { invoice_number: string } | { invoice_number: string }[] }).invoices)
      return matchesSearch(search, t.description, proj?.name, proj?.clients?.legal_name, inv?.invoice_number)
    })
  }, [rows, billingFilter, projectFilter, clientFilter, dateFrom, dateTo, search])

  const hasFilters = !!(search || projectFilter || clientFilter || dateFrom || dateTo || billingFilter !== 'all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [p, entries] = await Promise.all([
      supabase.from('projects').select('*, clients(legal_name)').order('name'),
      supabase
        .from('time_entries')
        .select('*, projects(name, default_hourly_rate, client_id, clients(legal_name)), invoices(invoice_number)')
        .order('entry_date', { ascending: false }),
    ])
    setAllProjects((p.data as Project[]) ?? [])
    setProjects(((p.data as Project[]) ?? []).filter((x) => x.status === 'active'))
    setRows((entries.data as TimeEntry[]) ?? [])
  }

  function openNew() {
    setForm({
      project_id: projects[0]?.id ?? '',
      entry_date: todayIso(),
      hours: 1,
      description: '',
      billable: true,
      rate_override: '',
    })
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(t: TimeEntry) {
    if (t.invoice_id) {
      alert('Entrée déjà facturée — modification limitée.')
      return
    }
    setForm({
      project_id: t.project_id,
      entry_date: t.entry_date,
      hours: Number(t.hours),
      description: t.description,
      billable: t.billable,
      rate_override: t.rate_override != null ? String(t.rate_override) : '',
    })
    setEditingId(t.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      project_id: form.project_id,
      entry_date: form.entry_date,
      hours: form.hours,
      description: form.description,
      billable: form.billable,
      rate_override: form.rate_override ? Number(form.rate_override) : null,
    }
    if (editingId) {
      await supabase.from('time_entries').update(payload).eq('id', editingId)
    } else {
      await supabase.from('time_entries').insert(payload)
    }
    setOpen(false)
    load()
  }

  async function remove(t: TimeEntry) {
    if (t.invoice_id) {
      alert('Impossible de supprimer une entrée facturée.')
      return
    }
    if (!confirm('Supprimer cette entrée ?')) return
    await supabase.from('time_entries').delete().eq('id', t.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Suivi du temps</h1>
        <Button onClick={openNew} disabled={projects.length === 0}>
          Logger du temps
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune entrée de temps." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Description, projet, client, facture…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterChips
              value={billingFilter}
              onChange={setBillingFilter}
              options={[
                { value: 'all', label: 'Tout' },
                { value: 'unbilled', label: 'Non facturé' },
                { value: 'invoiced', label: 'Facturé' },
              ]}
            />
            <FilterSelect
              label="Projet"
              value={projectFilter}
              onChange={setProjectFilter}
              options={[{ value: '', label: 'Tous' }, ...allProjects.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <FilterSelect
              label="Client"
              value={clientFilter}
              onChange={setClientFilter}
              options={[{ value: '', label: 'Tous' }, ...clientOptions]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setProjectFilter('')
                setClientFilter('')
                setDateFrom('')
                setDateTo('')
                setBillingFilter('all')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune entrée ne correspond aux filtres." />
          ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Projet</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Heures</th>
                <th className="px-4 py-3 font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">Facturation</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const proj = relationOne(t.projects)
                const rate = proj ? effectiveRate(t, proj) : 0
                const amt = t.billable && proj ? lineAmount(Number(t.hours), rate) : 0
                const inv = relationOne((t as TimeEntry & { invoices?: { invoice_number: string } | { invoice_number: string }[] }).invoices)
                return (
                  <tr key={t.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3">{formatDate(t.entry_date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{proj?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{proj?.clients?.legal_name}</div>
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs truncate">{t.description}</td>
                    <td className="px-4 py-3">{Number(t.hours).toFixed(2)}</td>
                    <td className="px-4 py-3">{t.billable ? formatCad(amt) : '—'}</td>
                    <td className="px-4 py-3">
                      {t.invoice_id ? (
                        <Badge label={inv?.invoice_number ?? 'Facturé'} tone="invoiced" />
                      ) : (
                        <Badge label="Non facturé" tone="unbilled" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(t)}>
                        Modifier
                      </Button>
                      <Button variant="danger" className="!px-2 !py-1" onClick={() => remove(t)}>
                        Suppr.
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
      <Modal title={editingId ? 'Modifier le temps' : 'Logger du temps'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Projet *">
            <select className={inputClass} required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.clients?.legal_name})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input type="date" className={inputClass} required value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </Field>
            <Field label="Heures *">
              <input type="number" step="0.25" min="0.25" className={inputClass} required value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Description *">
            <textarea className={inputClass} required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taux override (optionnel)">
              <input type="number" step="0.01" className={inputClass} placeholder="Taux projet par défaut" value={form.rate_override} onChange={(e) => setForm({ ...form, rate_override: e.target.value })} />
            </Field>
            <Field label="Facturable">
              <select className={inputClass} value={form.billable ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, billable: e.target.value === 'yes' })}>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
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
