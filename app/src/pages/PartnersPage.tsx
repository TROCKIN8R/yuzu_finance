import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Partner, PartnerKind, InvoiceLanguage } from '../lib/types'
import { matchesSearch, countActiveFilters } from '../lib/filters'
import { INVOICE_LANGUAGE_LABELS, PARTNER_KIND_LABELS, formatInvoicePenaltyPercent } from '../lib/partners'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'

const empty: Partial<Partner> = {
  legal_name: '',
  kind: 'customer',
  contact_name: '',
  email: '',
  address_line1: '',
  city: 'Montréal',
  province: 'QC',
  postal_code: '',
  country: 'Canada',
  language: 'fr' as InvoiceLanguage,
  payment_terms_days: 30,
  invoice_penalty_monthly_pct: 0.02,
  notes: '',
}

const KIND_OPTIONS: { value: PartnerKind | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'customer', label: PARTNER_KIND_LABELS.customer },
  { value: 'provider', label: PARTNER_KIND_LABELS.provider },
  { value: 'both', label: PARTNER_KIND_LABELS.both },
]

function kindBadgeTone(kind: PartnerKind) {
  if (kind === 'customer') return 'active'
  if (kind === 'provider') return 'sent'
  return 'draft'
}

export function PartnersPage() {
  const [rows, setRows] = useState<Partner[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Partial<Partner>>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<PartnerKind | ''>('')

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        if (kindFilter && p.kind !== kindFilter) return false
        return matchesSearch(search, p.legal_name, p.contact_name, p.email, p.city, p.province, p.notes, p.kind)
      }),
    [rows, search, kindFilter]
  )

  const hasFilters = !!(search || kindFilter)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase.from('partners').select('*').order('legal_name')
    setRows(data ?? [])
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(p: Partner) {
    setForm(p)
    setEditingId(p.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      legal_name: form.legal_name!,
      kind: form.kind ?? 'customer',
      contact_name: form.contact_name || null,
      email: form.email || null,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      province: form.province || null,
      postal_code: form.postal_code || null,
      country: form.country || null,
      language: form.language ?? 'fr',
      payment_terms_days: form.payment_terms_days ?? 30,
      invoice_penalty_monthly_pct: form.invoice_penalty_monthly_pct ?? 0.02,
      notes: form.notes || null,
    }
    if (editingId) {
      const { error } = await supabase.from('partners').update(payload).eq('id', editingId)
      if (error) {
        alert(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('partners').insert(payload)
      if (error) {
        alert(error.message)
        return
      }
    }
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce partenaire ?')) return
    await supabase.from('partners').delete().eq('id', id)
    load()
  }

  return (
    <PageShell>
      <PageHeader
        title="Partenaires"
        subtitle="Clients, fournisseurs, ou les deux — une fiche par organisation."
        actions={<Button onClick={openNew}>Nouveau partenaire</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState message="Aucun partenaire — ajoutez votre premier contact commercial." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nom, contact, courriel, ville…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, !!kindFilter)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setKindFilter('')
            }}
          >
            <FilterSelect
              label="Rôle"
              value={kindFilter}
              onChange={(v) => setKindFilter(v as PartnerKind | '')}
              options={KIND_OPTIONS}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucun partenaire ne correspond à votre recherche." />
          ) : (
            <DataTable>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 font-medium">Rôle</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Courriel</th>
                  <th className="px-4 py-3 font-medium">Langue facture</th>
                  <th className="px-4 py-3 font-medium">Délai net</th>
                  <th className="px-4 py-3 font-medium">Pénalité facture</th>
                  <th className="px-4 py-3 font-medium">Ville</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium">{p.legal_name}</td>
                    <td className="px-4 py-3">
                      <Badge label={PARTNER_KIND_LABELS[p.kind]} tone={kindBadgeTone(p.kind)} />
                    </td>
                    <td className="px-4 py-3 text-muted">{p.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{p.email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">
                      {p.kind === 'provider' ? '—' : INVOICE_LANGUAGE_LABELS[p.language === 'en' ? 'en' : 'fr']}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.kind === 'provider' ? '—' : `Net ${p.payment_terms_days ?? 30}`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.kind === 'provider' ? '—' : formatInvoicePenaltyPercent(p)}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.city ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(p)}>
                          Modifier
                        </Button>
                        <Button variant="danger" className={tableActionClass} onClick={() => remove(p.id)}>
                          Suppr.
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}
      <Modal title={editingId ? 'Modifier le partenaire' : 'Nouveau partenaire'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nom légal *">
            <input
              className={inputClass}
              required
              value={form.legal_name ?? ''}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </Field>
          <Field label="Rôle *">
            <select
              className={inputClass}
              required
              value={form.kind ?? 'customer'}
              onChange={(e) => setForm({ ...form, kind: e.target.value as PartnerKind })}
            >
              <option value="customer">{PARTNER_KIND_LABELS.customer}</option>
              <option value="provider">{PARTNER_KIND_LABELS.provider}</option>
              <option value="both">{PARTNER_KIND_LABELS.both}</option>
            </select>
            <p className="text-xs text-muted mt-1">
              Les rôles « Client » et « Client et fournisseur » peuvent être liés à des projets et factures.
            </p>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contact">
              <input
                className={inputClass}
                value={form.contact_name ?? ''}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </Field>
            <Field label="Courriel">
              <input
                type="email"
                className={inputClass}
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Adresse">
            <input
              className={inputClass}
              value={form.address_line1 ?? ''}
              onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Ville">
              <input className={inputClass} value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Province">
              <input
                className={inputClass}
                value={form.province ?? ''}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </Field>
            <Field label="Code postal">
              <input
                className={inputClass}
                value={form.postal_code ?? ''}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
            </Field>
            <Field label="Pays">
              <input
                className={inputClass}
                value={form.country ?? ''}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </Field>
          </div>
          {(form.kind === 'customer' || form.kind === 'both') && (
            <>
              <Field label="Langue des factures">
                <select
                  className={inputClass}
                  value={form.language ?? 'fr'}
                  onChange={(e) => setForm({ ...form, language: e.target.value as InvoiceLanguage })}
                >
                  <option value="fr">{INVOICE_LANGUAGE_LABELS.fr}</option>
                  <option value="en">{INVOICE_LANGUAGE_LABELS.en}</option>
                </select>
                <p className="text-xs text-muted mt-1">Détermine la langue du PDF (titres, colonnes, taxes).</p>
              </Field>
              <Field label="Délai net (jours)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={form.payment_terms_days ?? 30}
                  onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })}
                />
                <p className="text-xs text-muted mt-1">Échéance de la facture (ex. Net 30).</p>
              </Field>
              <Field label="Pénalité sur facture (%)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  value={Number(((form.invoice_penalty_monthly_pct ?? 0.02) * 100).toFixed(4))}
                  onChange={(e) =>
                    setForm({ ...form, invoice_penalty_monthly_pct: Number(e.target.value) / 100 })
                  }
                />
                <p className="text-xs text-muted mt-1">
                  Taux mensuel appliqué aux montants en souffrance (défaut 2 %). Affiché sur le PDF.
                </p>
              </Field>
            </>
          )}
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
