import { useEffect, useMemo, useState } from 'react'
import {
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  daysUntilDue,
  fetchComplianceDeadlines,
  seedComplianceCalendar,
  syncLinkedComplianceDeadlines,
  urgencyTone,
} from '../lib/compliance'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { matchesSearch, countActiveFilters } from '../lib/filters'
import { supabase } from '../lib/supabase'
import type {
  ComplianceDeadline,
  ComplianceDeadlineCategory,
  ComplianceDeadlineStatus,
  OrganizationSettings,
} from '../lib/types'
import { AlertBanner } from '../components/AlertBanner'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Field, inputClass } from '../components/Field'
import { FilterSelect, ListToolbar } from '../components/ListToolbar'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'

const empty = {
  title: '',
  category: 'other' as ComplianceDeadlineCategory,
  due_date: todayIso(),
  status: 'open' as ComplianceDeadlineStatus,
  amount: '',
  notes: '',
}

function statusTone(status: ComplianceDeadlineStatus, dueDate: string) {
  if (status === 'done') return 'paid'
  if (status === 'skipped') return 'draft'
  const u = urgencyTone(dueDate)
  if (u === 'overdue') return 'void'
  if (u === 'soon') return 'sent'
  return 'active'
}

export function CompliancePage() {
  const [rows, setRows] = useState<ComplianceDeadline[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (categoryFilter && r.category !== categoryFilter) return false
      return matchesSearch(search, r.title, r.notes, r.category, r.source)
    })
  }, [rows, search, statusFilter, categoryFilter])

  const hasFilters = !!(search || statusFilter !== 'open' || categoryFilter)
  const openCount = rows.filter((r) => r.status === 'open').length
  const overdueCount = rows.filter((r) => r.status === 'open' && daysUntilDue(r.due_date) < 0).length

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setError(null)
    try {
      setRows(await fetchComplianceDeadlines())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
      setRows([])
    }
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(r: ComplianceDeadline) {
    setForm({
      title: r.title,
      category: r.category,
      due_date: r.due_date,
      status: r.status,
      amount: r.amount != null ? String(r.amount) : '',
      notes: r.notes ?? '',
    })
    setEditingId(r.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      title: form.title.trim(),
      category: form.category,
      due_date: form.due_date,
      status: form.status,
      amount: form.amount === '' ? null : Number(form.amount),
      notes: form.notes.trim() || null,
      source: editingId ? undefined : ('manual' as const),
      source_key: editingId ? undefined : `manual:${crypto.randomUUID()}`,
      completed_at: form.status === 'done' ? new Date().toISOString() : null,
    }
    if (editingId) {
      await supabase
        .from('compliance_deadlines')
        .update({
          title: payload.title,
          category: payload.category,
          due_date: payload.due_date,
          status: payload.status,
          amount: payload.amount,
          notes: payload.notes,
          completed_at: payload.completed_at,
        })
        .eq('id', editingId)
    } else {
      await supabase.from('compliance_deadlines').insert(payload)
    }
    setOpen(false)
    void load()
  }

  async function markDone(id: string) {
    await supabase
      .from('compliance_deadlines')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', id)
    void load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette échéance ?')) return
    await supabase.from('compliance_deadlines').delete().eq('id', id)
    void load()
  }

  async function seedAndSync() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const { data: settings } = await supabase.from('organization_settings').select('*').maybeSingle()
      const row = settings as OrganizationSettings | null
      const seeded = await seedComplianceCalendar({
        fiscal_year_end_month: row?.fiscal_year_end_month ?? 12,
        fiscal_year_end_day: row?.fiscal_year_end_day ?? 31,
        charge_gst: row?.charge_gst ?? true,
        charge_qst: row?.charge_qst ?? true,
      })
      const synced = await syncLinkedComplianceDeadlines()
      setMessage(
        `Calendrier mis à jour : ${seeded} rappels générés/rafraîchis, ${synced} échéances liées synchronisées. Brouillon — confirmer les dates réelles.`
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la génération.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Calendrier de conformité"
        subtitle="Retenues, TPS/TVQ, impôts, NEQ — brouillon pour révision CPA."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void seedAndSync()}>
              {busy ? 'Génération…' : 'Générer / synchroniser'}
            </Button>
            <Button onClick={openNew}>Nouvelle échéance</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="ui-card px-4 py-3">
          <div className="ui-metric-label">Ouvertes</div>
          <div className="text-xl font-semibold mt-0.5">{openCount}</div>
        </div>
        <div className="ui-card px-4 py-3">
          <div className="ui-metric-label">En retard</div>
          <div className={`text-xl font-semibold mt-0.5 ${overdueCount ? 'text-red-700' : ''}`}>
            {overdueCount}
          </div>
        </div>
        <div className="ui-card px-4 py-3 col-span-2 sm:col-span-1">
          <div className="ui-metric-label">Total</div>
          <div className="text-xl font-semibold mt-0.5">{rows.length}</div>
        </div>
      </div>

      {message && (
        <div className="mb-4">
          <AlertBanner variant="info">{message}</AlertBanner>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <AlertBanner variant="warning">{error}</AlertBanner>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState message="Aucune échéance. Cliquez « Générer / synchroniser » pour démarrer." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Titre, notes…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, statusFilter !== 'open', !!categoryFilter)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('open')
              setCategoryFilter('')
            }}
          >
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'open', label: 'À faire' },
                { value: 'done', label: 'Fait' },
                { value: 'skipped', label: 'Ignoré' },
              ]}
            />
            <FilterSelect
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Toutes' },
                ...Object.entries(COMPLIANCE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </ListToolbar>

          {filtered.length === 0 ? (
            <EmptyState message="Aucune échéance ne correspond aux filtres." />
          ) : (
            <DataTable minWidth={900}>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                  <th className="px-4 py-3 font-medium">Catégorie</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.title}</div>
                      {r.notes && <div className="text-xs text-muted mt-0.5 line-clamp-1">{r.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted">{COMPLIANCE_CATEGORY_LABELS[r.category]}</td>
                    <td className="px-4 py-3">{formatDate(r.due_date)}</td>
                    <td className="px-4 py-3">
                      <Badge label={COMPLIANCE_STATUS_LABELS[r.status]} tone={statusTone(r.status, r.due_date)} />
                    </td>
                    <td className="px-4 py-3">
                      {r.amount != null && Number(r.amount) !== 0 ? formatCad(Number(r.amount)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {r.status === 'open' && (
                        <Button variant="ghost" className={tableActionClass} onClick={() => void markDone(r.id)}>
                          Fait
                        </Button>
                      )}
                      <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(r)}>
                        Modifier
                      </Button>
                      {r.source === 'manual' && (
                        <Button variant="danger" className={tableActionClass} onClick={() => void remove(r.id)}>
                          Suppr.
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      <Modal title={editingId ? 'Modifier l’échéance' : 'Nouvelle échéance'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <Field label="Titre *">
            <input
              className={inputClass}
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Catégorie">
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ComplianceDeadlineCategory })}
              >
                {Object.entries(COMPLIANCE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date d’échéance *">
              <input
                type="date"
                className={inputClass}
                required
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Statut">
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ComplianceDeadlineStatus })}
              >
                {Object.entries(COMPLIANCE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Montant (CAD)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
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
