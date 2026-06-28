import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BillingType, Client, Project, ProjectStatus } from '../lib/types'
import { matchesSearch } from '../lib/filters'
import { billingTypeLabel, projectAmountLabel } from '../lib/invoice'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, FilterSelect, ListToolbar } from '../components/ListToolbar'

export function ProjectsPage() {
  const [rows, setRows] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    client_id: '',
    name: '',
    status: 'active' as ProjectStatus,
    billing_type: 'hourly' as BillingType,
    default_hourly_rate: 150,
    fixed_price: 3500,
    notes: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (clientFilter && p.client_id !== clientFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      return matchesSearch(
        search,
        p.name,
        p.clients?.legal_name,
        p.notes,
        p.default_hourly_rate,
        p.fixed_price,
        p.billing_type
      )
    })
  }, [rows, search, clientFilter, statusFilter])

  const hasFilters = !!(search || clientFilter || statusFilter)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [p, c] = await Promise.all([
      supabase.from('projects').select('*, clients(legal_name)').order('name'),
      supabase.from('clients').select('*').order('legal_name'),
    ])
    setRows((p.data as Project[]) ?? [])
    setClients(c.data ?? [])
  }

  function openNew() {
    setForm({
      client_id: clients[0]?.id ?? '',
      name: '',
      status: 'active',
      billing_type: 'hourly',
      default_hourly_rate: 150,
      fixed_price: 3500,
      notes: '',
    })
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(p: Project) {
    setForm({
      client_id: p.client_id,
      name: p.name,
      status: p.status,
      billing_type: p.billing_type === 'fixed' ? 'fixed' : 'hourly',
      default_hourly_rate: p.default_hourly_rate,
      fixed_price: p.fixed_price != null ? Number(p.fixed_price) : 3500,
      notes: p.notes ?? '',
    })
    setEditingId(p.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      client_id: form.client_id,
      name: form.name,
      status: form.status,
      billing_type: form.billing_type,
      default_hourly_rate: form.billing_type === 'hourly' ? form.default_hourly_rate : 0,
      fixed_price: form.billing_type === 'fixed' ? form.fixed_price : null,
      notes: form.notes || null,
    }
    if (editingId) {
      await supabase.from('projects').update(payload).eq('id', editingId)
    } else {
      await supabase.from('projects').insert(payload)
    }
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce projet ?')) return
    await supabase.from('projects').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold">Projets</h1>
        <Button onClick={openNew} disabled={clients.length === 0}>
          Nouveau projet
        </Button>
      </div>
      {clients.length === 0 && <p className="text-sm text-muted mb-4">Ajoutez un client avant de créer un projet.</p>}
      {rows.length === 0 ? (
        <EmptyState message="Aucun projet." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Projet, client…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterSelect
              label="Client"
              value={clientFilter}
              onChange={setClientFilter}
              options={[{ value: '', label: 'Tous' }, ...clients.map((c) => ({ value: c.id, label: c.legal_name }))]}
            />
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'active', label: 'active' },
                { value: 'on_hold', label: 'on_hold' },
                { value: 'completed', label: 'completed' },
                { value: 'archived', label: 'archived' },
              ]}
            />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setClientFilter('')
                setStatusFilter('')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucun projet ne correspond aux filtres." />
          ) : (
            <DataTable minWidth={900}>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Projet</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Facturation</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted">{p.clients?.legal_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge label={billingTypeLabel(p.billing_type)} tone={p.billing_type === 'fixed' ? 'sent' : 'active'} />
                    </td>
                    <td className="px-4 py-3">{projectAmountLabel(p)}</td>
                    <td className="px-4 py-3">
                      <Badge label={p.status} tone={p.status} />
                      {p.billing_type === 'fixed' && p.invoice_id && (
                        <span className="ml-2 text-xs text-muted">facturé</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(p)}>
                        Modifier
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => remove(p.id)}>
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
      <Modal title={editingId ? 'Modifier le projet' : 'Nouveau projet'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Client *">
            <select
              className={inputClass}
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nom du projet *">
            <input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Type de facturation *">
            <select
              className={inputClass}
              value={form.billing_type}
              onChange={(e) => setForm({ ...form, billing_type: e.target.value as BillingType })}
            >
              <option value="hourly">Horaire (temps enregistré)</option>
              <option value="fixed">Forfait (montant fixe)</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.billing_type === 'hourly' ? (
              <Field label="Taux horaire (CAD) *">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  required
                  value={form.default_hourly_rate}
                  onChange={(e) => setForm({ ...form, default_hourly_rate: Number(e.target.value) })}
                />
              </Field>
            ) : (
              <Field label="Montant forfaitaire (CAD) *">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  required
                  value={form.fixed_price}
                  onChange={(e) => setForm({ ...form, fixed_price: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label="Statut">
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
              >
                <option value="active">active</option>
                <option value="on_hold">on_hold</option>
                <option value="completed">completed</option>
                <option value="archived">archived</option>
              </select>
            </Field>
          </div>
          {form.billing_type === 'fixed' && (
            <p className="text-xs text-muted">
              Les projets forfaitaires apparaissent dans Factures → Créer une facture. Le temps ne s&apos;y applique pas.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
