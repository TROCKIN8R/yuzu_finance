import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { OrganizationSettings } from '../lib/types'
import {
  buildOrganizationSettingsRow,
  buildOrganizationSettingsRowLegacy,
  DEFAULT_ESTIMATED_CORP_TAX_RATE,
  mapSettingsRowToForm,
  settingsSaveErrorMessage,
  type OrganizationSettingsForm,
} from '../lib/organizationSettings'
import {
  composePaymentInstructions,
  DEFAULT_BILLING_EMAIL,
} from '../lib/paymentInstructions'
import { DEFAULT_FISCAL_YEAR_END_DAY, DEFAULT_FISCAL_YEAR_END_MONTH } from '../lib/fiscalPeriod'
import { formatCad } from '../lib/format'
import { Button } from '../components/Button'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'

const defaults: OrganizationSettingsForm = {
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
  invoice_penalty_monthly_pct: 0.02,
  payment_instructions: null,
  interac_email: DEFAULT_BILLING_EMAIL,
  bank_institution: '',
  bank_transit: '',
  bank_account: '',
  billing_inquiries_email: DEFAULT_BILLING_EMAIL,
  payment_instructions_fr: null,
  payment_instructions_en: null,
  share_capital: 0,
  opening_retained_earnings: 0,
  opening_cash_balance: 0,
  opening_balance_date: null,
  fiscal_year_end_month: DEFAULT_FISCAL_YEAR_END_MONTH,
  fiscal_year_end_day: DEFAULT_FISCAL_YEAR_END_DAY,
  estimated_corp_tax_rate: DEFAULT_ESTIMATED_CORP_TAX_RATE,
  wip_accrual_enabled: false,
  hsf_rate: 0.0165,
  cnesst_rate: 0.01,
}

function withBillingDefaults(form: OrganizationSettingsForm): OrganizationSettingsForm {
  return {
    ...form,
    interac_email: form.interac_email?.trim() || DEFAULT_BILLING_EMAIL,
    billing_inquiries_email: form.billing_inquiries_email?.trim() || DEFAULT_BILLING_EMAIL,
    bank_institution: form.bank_institution ?? '',
    bank_transit: form.bank_transit ?? '',
    bank_account: form.bank_account ?? '',
  }
}

export function SettingsPage() {
  const [form, setForm] = useState(defaults)
  const [userId, setUserId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const paymentPreviewFr = useMemo(() => composePaymentInstructions(form, 'fr'), [form])
  const paymentPreviewEn = useMemo(() => composePaymentInstructions(form, 'en'), [form])
  const openingGap = useMemo(() => {
    const cash = Number(form.opening_cash_balance) || 0
    const cap = Number(form.share_capital) || 0
    const re = Number(form.opening_retained_earnings) || 0
    return Math.round((cash - cap - re) * 100) / 100
  }, [form.opening_cash_balance, form.share_capital, form.opening_retained_earnings])
  const openingReSpecified = Math.abs(Number(form.opening_retained_earnings) || 0) > 0.01

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoadError(null)
    const { data: session } = await supabase.auth.getSession()
    const uid = session.session?.user.id
    if (!uid) return
    setUserId(uid)

    const { data, error } = await supabase.from('organization_settings').select('*').eq('user_id', uid).maybeSingle()
    if (error) {
      setLoadError(settingsSaveErrorMessage(error))
      setForm(defaults)
      return
    }

    if (data) {
      setForm(withBillingDefaults(mapSettingsRowToForm(data as OrganizationSettings)))
    } else {
      setForm(defaults)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || saving) return

    setSaving(true)
    setSaveError(null)

    const payment_instructions_fr = composePaymentInstructions(form, 'fr')
    const payment_instructions_en = composePaymentInstructions(form, 'en')
    const row = buildOrganizationSettingsRow(userId, form, payment_instructions_fr, payment_instructions_en)

    let usedLegacyFallback = false

    let { error } = await supabase.from('organization_settings').upsert(row, { onConflict: 'user_id' })

    if (
      error &&
      (error.message.includes('interac_email') ||
        error.message.includes('payment_instructions_fr') ||
        error.message.includes('bank_institution'))
    ) {
      const legacyRow = buildOrganizationSettingsRowLegacy(userId, form, payment_instructions_fr)
      const retry = await supabase.from('organization_settings').upsert(legacyRow, { onConflict: 'user_id' })
      error = retry.error
      usedLegacyFallback = !error
    }

    setSaving(false)

    if (error) {
      setSaveError(settingsSaveErrorMessage(error))
      return
    }

    setForm((prev) => ({
      ...prev,
      payment_instructions_fr: payment_instructions_fr || null,
      payment_instructions_en: payment_instructions_en || null,
      payment_instructions: payment_instructions_fr || null,
    }))
    setSaveError(
      usedLegacyFallback
        ? 'Enregistré (sans coordonnées de paiement) — exécutez la migration 20260630140000_billing_payment_settings.sql dans Supabase.'
        : null
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!userId) return <EmptyState message="Connectez-vous pour gérer les paramètres." />

  return (
    <PageShell width="narrow">
      <PageHeader title="Paramètres" subtitle="Entreprise, taxes, exercice fiscal et avoir." />
      {loadError && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
      )}
      <form onSubmit={save} className="space-y-6 ui-card p-5">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Ville"><input className={inputClass} value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Prov."><input className={inputClass} value={form.province ?? ''} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
            <Field label="Code postal"><input className={inputClass} value={form.postal_code ?? ''} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></Field>
            <Field label="Pays"><input className={inputClass} value={form.country ?? ''} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">TPS / TVQ</h2>
          <p className="text-xs text-muted">
            Activez ici lorsque votre entreprise est inscrite. Si un n° TPS ou TVQ est saisi, les nouvelles factures
            incluent les taxes par défaut (décochable par facture). TPS et TVQ s&apos;appliquent chacune sur le montant
            hors taxes (règle en vigueur depuis 2013 — pas de TVQ sur la TPS). Entrez les taux en décimal : 0,05 =
            5&nbsp;%, 0,09975 = 9,975&nbsp;%.
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
            <Field label="Pénalité facture (%)">
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass}
                value={Number((form.invoice_penalty_monthly_pct * 100).toFixed(4))}
                onChange={(e) => setForm({ ...form, invoice_penalty_monthly_pct: Number(e.target.value) / 100 })}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-stone-50/80 p-3 space-y-3">
            <div>
              <h3 className="text-sm font-medium">Coordonnées de paiement</h3>
              <p className="text-xs text-muted mt-0.5">
                Données sensibles — stockées dans Supabase uniquement. Utilisées pour générer le pied de page bilingue
                des factures.
              </p>
            </div>
            <Field label="Courriel Interac">
              <input
                type="email"
                className={inputClass}
                value={form.interac_email ?? ''}
                onChange={(e) => setForm({ ...form, interac_email: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Institution">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="623"
                  value={form.bank_institution ?? ''}
                  onChange={(e) => setForm({ ...form, bank_institution: e.target.value })}
                />
              </Field>
              <Field label="Transit">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={form.bank_transit ?? ''}
                  onChange={(e) => setForm({ ...form, bank_transit: e.target.value })}
                />
              </Field>
              <Field label="Compte">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.bank_account ?? ''}
                  onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Courriel comptabilité (questions)">
              <input
                type="email"
                className={inputClass}
                value={form.billing_inquiries_email ?? ''}
                onChange={(e) => setForm({ ...form, billing_inquiries_email: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pied de page facture — français">
              <textarea className={`${inputClass} bg-stone-50`} rows={6} readOnly value={paymentPreviewFr} />
            </Field>
            <Field label="Pied de page facture — English">
              <textarea className={`${inputClass} bg-stone-50`} rows={6} readOnly value={paymentPreviewEn} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Aperçu en direct. Enregistrez pour stocker les versions FR et EN ; la facture PDF utilise celle du partenaire.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Exercice fiscal et avoir</h2>
          <p className="text-xs text-muted">
            L&apos;écriture d&apos;ouverture est Dr banque · Cr capital-actions · Cr BNR. Les trois montants doivent
            s&apos;équilibrer (trésorerie = capital + BNR). La trésorerie d&apos;ouverture est le solde bancaire à
            cette date : si le CSV commence après, elle est ajoutée au solde banque de réconciliation (pas en double
            dans le relevé). Un écart avec BNR saisi va au compte d&apos;attente 1190, pas au 3100. Sans BNR saisi,
            l&apos;écart trésorerie − capital est imputé au BNR. Si la trésorerie d&apos;ouverture est à 0 et que le
            dépôt est dans le CSV, affectez-le en « Solde d&apos;ouverture (BNR) » (ça solde le 1190). Taux d&apos;impôt
            société : décimal de planification (0,205 = 20,5 %) — féd. 9 % DPE + QC 11,5 % général, brouillon CPA.
          </p>
          <Field label="Date des soldes d'ouverture">
            <input
              type="date"
              className={inputClass}
              value={form.opening_balance_date ?? ''}
              onChange={(e) => setForm({ ...form, opening_balance_date: e.target.value || null })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fin AF — mois"><input type="number" min={1} max={12} className={inputClass} value={form.fiscal_year_end_month} onChange={(e) => setForm({ ...form, fiscal_year_end_month: Number(e.target.value) })} /></Field>
            <Field label="Fin AF — jour"><input type="number" min={1} max={31} className={inputClass} value={form.fiscal_year_end_day} onChange={(e) => setForm({ ...form, fiscal_year_end_day: Number(e.target.value) })} /></Field>
            <Field label="Capital-actions ($)"><input type="number" step="0.01" className={inputClass} value={form.share_capital} onChange={(e) => setForm({ ...form, share_capital: Number(e.target.value) })} /></Field>
            <Field label="BNR d'ouverture ($)"><input type="number" step="0.01" className={inputClass} value={form.opening_retained_earnings} onChange={(e) => setForm({ ...form, opening_retained_earnings: Number(e.target.value) })} /></Field>
            <Field label="Trésorerie d'ouverture ($)"><input type="number" step="0.01" className={inputClass} value={form.opening_cash_balance} onChange={(e) => setForm({ ...form, opening_cash_balance: Number(e.target.value) })} /></Field>
            <Field label="Taux impôt société (estim.)"><input type="number" step="0.001" min={0} max={1} className={inputClass} value={form.estimated_corp_tax_rate} onChange={(e) => setForm({ ...form, estimated_corp_tax_rate: Number(e.target.value) })} /></Field>
          </div>
          {Math.abs(openingGap) > 0.01 && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {openingReSpecified
                ? `Écart d'ouverture ${formatCad(openingGap)} : porté au compte d'attente 1190 pour équilibrer l'écriture. Le BNR saisi reste au 3100.`
                : `Sans BNR saisi, l'écart trésorerie − capital (${formatCad(openingGap)}) est imputé au BNR (3100).`}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Comptabilité avancée</h2>
          <p className="text-xs text-muted">
            WIP : constat mensuel des revenus non facturés (Dr 1300 · Cr 4000). HSF/CNESST : taux planification
            seulement — confirmez avec votre CPA ou paie.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.wip_accrual_enabled}
              onChange={(e) => setForm({ ...form, wip_accrual_enabled: e.target.checked })}
            />
            Activer la constatation WIP (revenus non facturés)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taux HSF (ex. 0.0165 = 1,65 %)">
              <input type="number" step="0.0001" className={inputClass} value={form.hsf_rate} onChange={(e) => setForm({ ...form, hsf_rate: Number(e.target.value) })} />
            </Field>
            <Field label="Taux CNESST (ex. 0.01 = 1 %)">
              <input type="number" step="0.0001" className={inputClass} value={form.cnesst_rate} onChange={(e) => setForm({ ...form, cnesst_rate: Number(e.target.value) })} />
            </Field>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          {saved && !saveError && <span className="text-sm text-emerald-600">Enregistré.</span>}
          {saveError && (
            <span className={`text-sm ${saveError.includes('partiellement') ? 'text-amber-800' : 'text-red-700'}`}>
              {saveError}
            </span>
          )}
        </div>
      </form>
    </PageShell>
  )
}
