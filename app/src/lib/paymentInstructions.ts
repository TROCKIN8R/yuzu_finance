import type { InvoiceLanguage, OrganizationSettings } from './types'

export type PaymentSettingsInput = Pick<
  OrganizationSettings,
  | 'interac_email'
  | 'bank_institution'
  | 'bank_transit'
  | 'bank_account'
  | 'billing_inquiries_email'
  | 'email'
>

export function composePaymentInstructions(
  settings: Partial<PaymentSettingsInput> | null | undefined,
  lang: InvoiceLanguage
): string {
  const interac = settings?.interac_email?.trim()
  const contact = settings?.billing_inquiries_email?.trim() || settings?.email?.trim()
  const inst = settings?.bank_institution?.trim()
  const transit = settings?.bank_transit?.trim()
  const account = settings?.bank_account?.trim()
  const hasEft = !!(inst || transit || account)

  const lines: string[] = []

  if (lang === 'en') {
    if (interac) lines.push(`Interac: ${interac}`)
    if (hasEft) {
      lines.push(
        `Bank transfer (CAD) — Inst. ${inst || '—'} · Transit ${transit || '—'} · Account ${account || '—'}`
      )
    }
    lines.push('Include the invoice number as reference.')
    if (contact) lines.push(`Questions: ${contact}`)
  } else {
    if (interac) lines.push(`Interac : ${interac}`)
    if (hasEft) {
      lines.push(
        `Virement (CAD) — Inst. ${inst || '—'} · Transit ${transit || '—'} · Compte ${account || '—'}`
      )
    }
    lines.push('Inclure le numéro de facture en référence.')
    if (contact) lines.push(`Questions : ${contact}`)
  }

  return lines.join('\n')
}

export function resolvePaymentInstructions(
  settings: OrganizationSettings | null,
  lang: InvoiceLanguage
): string | null {
  const stored =
    lang === 'en' ? settings?.payment_instructions_en?.trim() : settings?.payment_instructions_fr?.trim()
  if (stored) return stored

  const composed = composePaymentInstructions(settings, lang)
  return composed || null
}

export const DEFAULT_BILLING_EMAIL = 'accounting@yuzu.solutions'
