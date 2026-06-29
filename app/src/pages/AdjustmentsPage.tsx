import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AccountingAdjustment, AdjustmentType } from '../lib/types'
import { CHART_OF_ACCOUNTS } from '../lib/chartOfAccounts'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'

const types: { value: AdjustmentType; label: string }[] = [
  { value: 'prepaid', label: 'Charge payée d\'avance' },
  { value: 'accrual', label: 'Charge à payer' },
  { value: 'depreciation', label: 'Amortissement' },
  { value: 'manual', label: 'Écriture manuelle' },
]

function emptyForm(type: AdjustmentType = 'prepaid') {
  const isManual = type === 'manual'
  return {
    adjustment_type: type,
    description: '',
    start_date: todayIso(),
    end_date: '',
    total_amount: 0,
    monthly_amount: 0,
    debit_account: isManual ? '1010' : '1400',
    credit_account: isManual ? '3000' : '1010',
    active: true,
    notes: '',
  }
}

export function AdjustmentsPage() {
  const [rows, setRows] = useState<AccountingAdjustment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saveError, setSaveError] = useState<string | null>(null)

  const isManual = form.adjustment_type === 'manual'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase.from('accounting_adjustments').select('*').order('start_date', { ascending: false })
    if (error) {
      setSaveError(
        error.message.includes('accounting_adjustments')
          ? 'Table accounting_adjustments manquante — exécutez la migration 20260630150100_accounting_adjustments.sql.'
          : error.message
      )
      setRows([])
      return
    }
    setSaveError(null)
    setRows((data as AccountingAdjustment[]) ?? [])
  }

  function setAdjustmentType(type: AdjustmentType) {
    setForm((prev) => ({
      ...emptyForm(type),
      description: prev.description,
      start_date: prev.start_date,
      end_date: prev.end_date,
      notes: prev.notes,
    }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)

    if (isManual && Number(form.total_amount) <= 0) {
      setSaveError('Indiquez un montant total supérieur à 0 pour une écriture manuelle.')
      return
    }
    if (!isManual && Number(form.monthly_amount) <= 0) {
      setSaveError('Indiquez un montant mensuel supérieur à 0.')
      return
    }

    const { error } = await supabase.from('accounting_adjustments').insert({
      adjustment_type: form.adjustment_type,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date || null,
      total_amount: isManual ? form.total_amount : null,
      monthly_amount: isManual ? null : form.monthly_amount,
      debit_account: form.debit_account,
      credit_account: form.credit_account,
      active: form.active,
      notes: form.notes || null,
    })

    if (error) {
      setSaveError(error.message)
      return
    }

    setOpen(false)
    setForm(emptyForm())
    load()
  }

  async function toggleActive(r: AccountingAdjustment) {
    await supabase.from('accounting_adjustments').update({ active: !r.active }).eq('id', r.id)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet ajustement ?')) return
    await supabase.from('accounting_adjustments').delete().eq('id', id)
    load()
  }

  const accountOptions = CHART_OF_ACCOUNTS.map((a) => (
    <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
  ))

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Ajustements comptables"
        subtitle="Prépaiements, charges à payer, amortissements et écritures manuelles."
        actions={<Button onClick={() => { setSaveError(null); setOpen(true) }}>Nouvel ajustement</Button>}
      />

      {saveError && !open && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState message="Aucun ajustement — ajoutez des écritures de fin de période ou utilisez Paramètres pour le capital d'ouverture." />
      ) : (
        <DataTable>
          <thead className="bg-stone-50 text-muted text-left text-sm">
            <tr>
              <th className="px-4 py-3">Début</th>
              <th className="px-4 py-3">Fin</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Comptes</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50/50">
                <td className="px-4 py-3">{formatDate(r.start_date)}</td>
                <td className="px-4 py-3 text-muted">{r.end_date ? formatDate(r.end_date) : '—'}</td>
                <td className="px-4 py-3">{types.find((t) => t.value === r.adjustment_type)?.label ?? r.adjustment_type}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">
                  {r.debit_account} → {r.credit_account}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.total_amount != null ? formatCad(r.total_amount) : r.monthly_amount != null ? `${formatCad(r.monthly_amount)}/mois` : '—'}
                </td>
                <td className="px-4 py-3">{r.active ? 'Oui' : 'Non'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button variant="ghost" className={tableActionClass} onClick={() => toggleActive(r)}>
                    {r.active ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button variant="danger" className={tableActionClass} onClick={() => remove(r.id)}>
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title="Nouvel ajustement" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Type">
            <select
              className={inputClass}
              value={form.adjustment_type}
              onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          {isManual && (
            <p className="text-xs text-muted bg-stone-50 border border-border rounded-lg px-3 py-2">
              Apport en capital typique : débit <strong>1010 Banque</strong>, crédit <strong>3000 Capital-actions</strong>.
              Pour l&apos;ouverture initiale, préférez Paramètres → Capital-actions / Trésorerie d&apos;ouverture.
            </p>
          )}
          <Field label="Description *">
            <input className={inputClass} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date de début *">
              <input type="date" className={inputClass} required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Date de fin">
              <input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          {isManual ? (
            <Field label="Montant total (CAD) *">
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={inputClass}
                required
                value={form.total_amount || ''}
                onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })}
              />
            </Field>
          ) : (
            <Field label="Montant mensuel (CAD) *">
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={inputClass}
                required
                value={form.monthly_amount || ''}
                onChange={(e) => setForm({ ...form, monthly_amount: Number(e.target.value) })}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Compte débit">
              <select className={inputClass} value={form.debit_account} onChange={(e) => setForm({ ...form, debit_account: e.target.value })}>{accountOptions}</select>
            </Field>
            <Field label="Compte crédit">
              <select className={inputClass} value={form.credit_account} onChange={(e) => setForm({ ...form, credit_account: e.target.value })}>{accountOptions}</select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {saveError && <p className="text-sm text-red-700">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
