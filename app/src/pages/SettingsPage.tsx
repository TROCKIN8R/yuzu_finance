import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { OrganizationSettings } from '../lib/types'
import { Button } from '../components/Button'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

const defaults: Omit<OrganizationSettings, 'user_id'> = {
  company_legal_name: '',
  company_operating_name: '',
  address_line1: '',
  city: '',
  province: 'QC',
  postal_code: '',
  country: 'Canada',
  neq: '',
  gst_number: '',
  qst_number: '',
  email: '',
  phone: '',
  charge_gst: false,
  charge_qst: false,
  gst_rate: 0.05,
  qst_rate: 0.09975,
  invoice_prefix: 'YUZU',
  payment_terms_days: 30,
  payment_instructions: '',
  share_capital: 0,
  opening_retained_earnings: 0,
  opening_cash_balance: 0,
  fiscal_year_end_month: 6,
  fiscal_year_end_day: 30,
  estimated_corp_tax_rate: 0.12,
}

export function SettingsPage() {
  const [form, setForm] = useState(defaults)
  const [userId, setUserId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: session } = await supabase.auth.getSession()
    const uid = session.session?.user.id
    if (!uid) return
    setUserId(uid)
    const { data } = await supabase.from('organization_settings').select('*').eq('user_id', uid).maybeSingle()
    if (data) {
      setForm({
        ...defaults,
        ...data,
        company_operating_name: data.company_operating_name ?? '',
        address_line1: data.address_line1 ?? '',
        city: data.city ?? '',
        province: data.province ?? 'QC',
        postal_code: data.postal_code ?? '',
        country: data.country ?? 'Canada',
        neq: data.neq ?? '',
        gst_number: data.gst_number ?? '',
        qst_number: data.qst_number ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        payment_instructions: data.payment_instructions ?? '',
        share_capital: Number(data.share_capital ?? 0),
        opening_retained_earnings: Number(data.opening_retained_earnings ?? 0),
        opening_cash_balance: Number(data.opening_cash_balance ?? 0),
        fiscal_year_end_month: Number(data.fiscal_year_end_month ?? 6),
        fiscal_year_end_day: Number(data.fiscal_year_end_day ?? 30),
        estimated_corp_tax_rate: Number(data.estimated_corp_tax_rate ?? 0.12),
      })
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const payload = {
      ...form,
      company_operating_name: form.company_operating_name || null,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      postal_code: form.postal_code || null,
      neq: form.neq || null,
      gst_number: form.gst_number || null,
      qst_number: form.qst_number || null,
      email: form.email || null,
      phone: form.phone || null,
      payment_instructions: form.payment_instructions || null,
    }
    await supabase.from('organization_settings').upsert({ user_id: userId, ...payload })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!userId) return <EmptyState message="Connectez-vous pour gérer les paramètres." />

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted mt-1">Entreprise, taxes, exercice fiscal et avoir.</p>
      </div>
      <form onSubmit={save} className="space-y-6 bg-white border border-border rounded-xl p-5">
        <section className="space-y-3">
          <h2 className="font-medium">Entreprise</h2>
          <Field label="Raison sociale *">
            <input className={inputClass} required value={form.company_legal_name} onChange={(e) => setForm({ ...form, company_legal_name: e.target.value })} />
          </Field>
          <Field label="Nom commercial">
            <input className={inputClass} value={form.company_operating_name ?? ''} onChange={(e) => setForm({ ...form, company_operating_name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="NEQ"><input className={inputClass} value={form.neq ?? ''} onChange={(e) => setForm({ ...form, neq: e.target.value })} /></Field>
            <Field label="Courriel"><input type="email" className={inputClass} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Adresse"><input className={inputClass} value={form.address_line1 ?? ''} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ville"><input className={inputClass} value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Prov."><input className={inputClass} value={form.province ?? ''} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
            <Field label="Code postal"><input className={inputClass} value={form.postal_code ?? ''} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">TPS / TVQ</h2>
          <p className="text-xs text-muted">
            Activez ici lorsque votre entreprise est inscrite. Chaque facture propose ensuite une case à cocher pour
            inclure ou non les taxes.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.charge_gst} onChange={(e) => setForm({ ...form, charge_gst: e.target.checked })} /> Percevoir TPS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.charge_qst} onChange={(e) => setForm({ ...form, charge_qst: e.target.checked })} /> Percevoir TVQ</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° TPS"><input className={inputClass} value={form.gst_number ?? ''} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></Field>
            <Field label="N° TVQ"><input className={inputClass} value={form.qst_number ?? ''} onChange={(e) => setForm({ ...form, qst_number: e.target.value })} /></Field>
            <Field label="Taux TPS"><input type="number" step="0.00001" className={inputClass} value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })} /></Field>
            <Field label="Taux TVQ"><input type="number" step="0.00001" className={inputClass} value={form.qst_rate} onChange={(e) => setForm({ ...form, qst_rate: Number(e.target.value) })} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Facturation</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Préfixe factures"><input className={inputClass} value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} /></Field>
            <Field label="Délai paiement (jours)"><input type="number" className={inputClass} value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Instructions de paiement"><textarea className={inputClass} rows={2} value={form.payment_instructions ?? ''} onChange={(e) => setForm({ ...form, payment_instructions: e.target.value })} /></Field>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Exercice fiscal et avoir</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fin AF — mois"><input type="number" min={1} max={12} className={inputClass} value={form.fiscal_year_end_month} onChange={(e) => setForm({ ...form, fiscal_year_end_month: Number(e.target.value) })} /></Field>
            <Field label="Fin AF — jour"><input type="number" min={1} max={31} className={inputClass} value={form.fiscal_year_end_day} onChange={(e) => setForm({ ...form, fiscal_year_end_day: Number(e.target.value) })} /></Field>
            <Field label="Capital-actions ($)"><input type="number" step="0.01" className={inputClass} value={form.share_capital} onChange={(e) => setForm({ ...form, share_capital: Number(e.target.value) })} /></Field>
            <Field label="BNR d'ouverture ($)"><input type="number" step="0.01" className={inputClass} value={form.opening_retained_earnings} onChange={(e) => setForm({ ...form, opening_retained_earnings: Number(e.target.value) })} /></Field>
            <Field label="Trésorerie d'ouverture ($)"><input type="number" step="0.01" className={inputClass} value={form.opening_cash_balance} onChange={(e) => setForm({ ...form, opening_cash_balance: Number(e.target.value) })} /></Field>
            <Field label="Taux impôt société (estim.)"><input type="number" step="0.01" className={inputClass} value={form.estimated_corp_tax_rate} onChange={(e) => setForm({ ...form, estimated_corp_tax_rate: Number(e.target.value) })} /></Field>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit">Enregistrer</Button>
          {saved && <span className="text-sm text-emerald-600">Enregistré.</span>}
        </div>
      </form>
    </div>
  )
}
