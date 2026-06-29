import type { Partner, PartnerKind, InvoiceLanguage } from './types'

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
