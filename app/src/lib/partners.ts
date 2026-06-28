import type { Partner, PartnerKind } from './types'

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  customer: 'Client',
  provider: 'Fournisseur',
  both: 'Client et fournisseur',
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
