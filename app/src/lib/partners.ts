import type { InvoiceLanguage, OrganizationSettings, Partner, PartnerKind } from './types'

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  customer: 'Client',
  provider: 'Fournisseur',
  both: 'Client et fournisseur',
}

export const INVOICE_LANGUAGE_LABELS: Record<InvoiceLanguage, string> = {
  fr: 'Français',
  en: 'English',
}

export function isCustomerPartner(kind: PartnerKind) {
  return kind === 'customer' || kind === 'both'
}

export function isProviderPartner(kind: PartnerKind) {
  return kind === 'provider' || kind === 'both'
}

export function customerPartners(partners: Partner[]) {
  return partners.filter((p) => isCustomerPartner(p.kind))
}

export function providerPartners(partners: Partner[]) {
  return partners.filter((p) => isProviderPartner(p.kind))
}

const DEFAULT_PAYMENT_TERMS_DAYS = 30
const DEFAULT_INVOICE_PENALTY_MONTHLY_PCT = 0.02

export function resolvePartnerPaymentTerms(
  partner: Pick<Partner, 'payment_terms_days' | 'invoice_penalty_monthly_pct'>,
  settings?: Pick<OrganizationSettings, 'payment_terms_days' | 'invoice_penalty_monthly_pct'> | null
) {
  return {
    days: partner.payment_terms_days ?? settings?.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS,
    invoicePenaltyMonthlyPct:
      partner.invoice_penalty_monthly_pct ?? settings?.invoice_penalty_monthly_pct ?? DEFAULT_INVOICE_PENALTY_MONTHLY_PCT,
  }
}

function formatPenaltyPct(pct: number) {
  const display = pct * 100
  return Number.isInteger(display) ? String(display) : display.toFixed(2).replace(/\.?0+$/, '')
}

export function formatInvoicePenaltyPercent(
  partner: Pick<Partner, 'invoice_penalty_monthly_pct'>,
  settings?: Pick<OrganizationSettings, 'invoice_penalty_monthly_pct'> | null
) {
  const pct =
    partner.invoice_penalty_monthly_pct ??
    settings?.invoice_penalty_monthly_pct ??
    DEFAULT_INVOICE_PENALTY_MONTHLY_PCT
  return `${formatPenaltyPct(pct)} %`
}

export function formatPartnerPaymentTerms(
  partner: Pick<Partner, 'payment_terms_days' | 'invoice_penalty_monthly_pct'>,
  lang: InvoiceLanguage,
  settings?: Pick<OrganizationSettings, 'payment_terms_days' | 'invoice_penalty_monthly_pct'> | null
) {
  const { days, invoicePenaltyMonthlyPct } = resolvePartnerPaymentTerms(partner, settings)
  const penalty = formatPenaltyPct(invoicePenaltyMonthlyPct)
  if (lang === 'en') {
    return `Net ${days}, ${penalty}% monthly penalty`
  }
  return `Net ${days}, pénalité de ${penalty} % par mois`
}
