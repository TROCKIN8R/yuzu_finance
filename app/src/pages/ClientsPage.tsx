import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/types'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

const empty: Partial<Client> = {
  legal_name: '',
  contact_name: '',
  email: '',
  address_line1: '',
  city: 'Montréal',
  province: 'QC',
  postal_code: '',
  country: 'Canada',
  payment_terms_days: 30,
  notes: '',
}

export function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Partial<Client>>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('legal_name')
    setRows(data ?? [])
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(c: Client) {
    setForm(c)
    setEditingId(c.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      legal_name: form.legal_name!,
      contact_name: form.contact_name || null,
      email: form.email || null,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      province: form.province || null,
      postal_code: form.postal_code || null,
      country: form.country || null,
      payment_terms_days: form.payment_terms_days ?? 30,
      notes: form.notes || null,
    }
    if (editingId) {
      await supabase.from('clients').update(payload).eq('id', editingId)
    } else {
      await supabase.from('clients').insert(payload)
    }
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={openNew}>Nouveau client</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucun client — ajoutez votre premier client." />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Courriel</th>
                <th className="px-4 py-3 font-medium">Ville</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 font-medium">{c.legal_name}</td>
                  <td className="px-4 py-3 text-muted">{c.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.city ?? '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(c)}>
                      Modifier
                    </Button>
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => remove(c.id)}>
                      Suppr.
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={editingId ? 'Modifier le client' : 'Nouveau client'} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nom légal *">
            <input className={inputClass} required value={form.legal_name ?? ''} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact">
              <input className={inputClass} value={form.contact_name ?? ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </Field>
            <Field label="Courriel">
              <input type="email" className={inputClass} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label="Adresse">
            <input className={inputClass} value={form.address_line1 ?? ''} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ville">
              <input className={inputClass} value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Province">
              <input className={inputClass} value={form.province ?? ''} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </Field>
            <Field label="Code postal">
              <input className={inputClass} value={form.postal_code ?? ''} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </Field>
          </div>
          <Field label="Délai de paiement (jours)">
            <input type="number" className={inputClass} value={form.payment_terms_days ?? 30} onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })} />
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
