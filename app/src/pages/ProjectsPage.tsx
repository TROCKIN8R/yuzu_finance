import { useEffect, useMemo, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { deleteEntityDocuments } from '../lib/documents'
import { supabase } from '../lib/supabase'
import type { BillingType, Partner, Project, ProjectStatus } from '../lib/types'
import { matchesSearch } from '../lib/filters'
import { customerPartners } from '../lib/partners'
import { billingTypeLabel, projectAmountLabel } from '../lib/invoice'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { DocumentAttachments } from '../components/DocumentAttachments'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { FilterSummary, FilterTh, HeaderSearch, HeaderSelect, PlainTh } from '../components/ColumnFilters'
import { PageHeader } from '../components/PageHeader'
import { StepActionBar } from '../components/WorkflowNav'
import { WorkflowFooter } from '../components/WorkflowFooter'
import { PageShell } from '../components/PageShell'

type BillingOutletContext = { refreshMetrics?: () => void }

export function ProjectsPage() {
  const location = useLocation()
  const embedded = location.pathname.startsWith('/billing')
  const { refreshMetrics } = useOutletContext<BillingOutletContext>() ?? {}
  const [rows, setRows] = useState<Project[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    partner_id: '',
    name: '',
    status: 'active' as ProjectStatus,
    billing_type: 'hourly' as BillingType,
    default_hourly_rate: 150,
    fixed_price: 3500,
    notes: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const billablePartners = useMemo(() => customerPartners(partners), [partners])

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (partnerFilter && p.partner_id !== partnerFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      return matchesSearch(
        search,
        p.name,
        p.partners?.legal_name,
        p.notes,
        p.default_hourly_rate,
        p.fixed_price,
        p.billing_type
      )
    })
  }, [rows, search, partnerFilter, statusFilter])

  const hasFilters = !!(search || partnerFilter || statusFilter)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [p, c] = await Promise.all([
      supabase.from('projects').select('*, partners(legal_name, kind)').order('name'),
      supabase.from('partners').select('*').order('legal_name'),
    ])
    setRows((p.data as Project[]) ?? [])
    setPartners(c.data ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    setForm({
      partner_id: billablePartners[0]?.id ?? '',
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
      partner_id: p.partner_id,
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
      partner_id: form.partner_id,
      name: form.name,
      status: form.status,
      billing_type: form.billing_type,
      default_hourly_rate: form.billing_type === 'hourly' ? form.default_hourly_rate : 0,
      fixed_price: form.billing_type === 'fixed' ? form.fixed_price : null,
      currency: 'CAD' as const,
      notes: form.notes || null,
    }
    if (editingId) {
      await supabase.from('projects').update(payload).eq('id', editingId)
      setOpen(false)
    } else {
      const { data, error } = await supabase.from('projects').insert(payload).select('id').single()
      if (!error && data?.id) {
        setEditingId(data.id)
        // Keep modal open so a PDF contract can be attached immediately.
      } else {
        setOpen(false)
      }
    }
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce projet ?')) return
    try {
      await deleteEntityDocuments('project', id)
    } catch {
      // continue — project row must still be removable if storage cleanup fails
    }
    await supabase.from('projects').delete().eq('id', id)
    load()
  }

  const newProjectBtn = (
    <Button onClick={openNew} disabled={billablePartners.length === 0}>
      Nouveau projet
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setPartnerFilter('')
    setStatusFilter('')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={newProjectBtn} />
      ) : (
        <PageHeader title="Projets" actions={newProjectBtn} />
      )}
      {billablePartners.length === 0 && (
        <p className="text-sm text-muted mb-3">
          Ajoutez un partenaire avec le rôle Client ou Client et fournisseur avant de créer un projet.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState message="Aucun projet." />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? newProjectBtn : undefined}
          />
          <DataTable minWidth={900}>
            <thead className="bg-stone-50 text-left">
              <tr>
                <FilterTh label="Projet">
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Nom…"
                    aria-label="Filtrer par projet"
                  />
                </FilterTh>
                <FilterTh label="Partenaire">
                  <HeaderSelect
                    value={partnerFilter}
                    onChange={setPartnerFilter}
                    aria-label="Filtrer par partenaire"
                    options={[
                      { value: '', label: 'Tous' },
                      ...billablePartners.map((p) => ({ value: p.id, label: p.legal_name })),
                    ]}
                  />
                </FilterTh>
                <PlainTh>Facturation</PlainTh>
                <PlainTh>Montant</PlainTh>
                <FilterTh label="Statut">
                  <HeaderSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    aria-label="Filtrer par statut"
                    options={[
                      { value: '', label: 'Tous' },
                      { value: 'active', label: 'Actif' },
                      { value: 'on_hold', label: 'En pause' },
                      { value: 'completed', label: 'Terminé' },
                      { value: 'archived', label: 'Archivé' },
                    ]}
                  />
                </FilterTh>
                <PlainTh className="w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted">
                    Aucun projet ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/50">
                    <td className="px-3 py-3 font-medium">{p.name}</td>
                    <td className="px-3 py-3 text-muted">{p.partners?.legal_name ?? '—'}</td>
                    <td className="px-3 py-3">
                      <Badge label={billingTypeLabel(p.billing_type)} tone={p.billing_type === 'fixed' ? 'sent' : 'active'} />
                    </td>
                    <td className="px-3 py-3">{projectAmountLabel(p)}</td>
                    <td className="px-3 py-3">
                      <Badge label={p.status} tone={p.status} />
                      {p.billing_type === 'fixed' && p.invoice_id && (
                        <span className="ml-2 text-xs text-muted">facturé</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right space-x-2">
                      <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(p)}>
                        Modifier
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => remove(p.id)}>
                        Suppr.
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}
      <Modal title={editingId ? 'Modifier le projet' : 'Nouveau projet'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Partenaire (client) *">
            <select
              className={inputClass}
              required
              value={form.partner_id}
              onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
            >
              {billablePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.legal_name}
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
              Les projets forfaitaires se facturent à l&apos;étape Factures. Le temps peut y être enregistré pour le suivi interne (non visible client).
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
            entityType="project"
            entityId={editingId}
            pdfOnly
            label="Contrat (PDF)"
            hint="MSA, SOW ou entente client — PDF uniquement. Enregistrez d’abord le projet pour joindre un fichier."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
      {embedded && rows.some((p) => p.status === 'active' && p.billing_type === 'hourly') && (
        <WorkflowFooter to="/billing/time" label="Enregistrer du temps">
          Projet horaire actif ?
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
