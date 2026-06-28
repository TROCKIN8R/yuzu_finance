import type { OrganizationSettings } from './types'

export type TaxSettings = Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'>

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Québec: TPS on taxable amount; TVQ on taxable amount + TPS. */
export function computeSalesTaxes(subtotal: number, settings: TaxSettings) {
  const base = round2(subtotal)
  const gst = settings.charge_gst ? round2(base * settings.gst_rate) : 0
  const qstBase = settings.charge_qst ? round2(base + gst) : 0
  const qst = settings.charge_qst ? round2(qstBase * settings.qst_rate) : 0
  return { subtotal: base, gst, qst, total: round2(base + gst + qst) }
}

/** ITC / RTI on purchases — same Québec compound rule. */
export function computePurchaseTaxes(amount: number, settings: TaxSettings) {
  return computeSalesTaxes(amount, settings)
}

export function isRevenueInvoice(status: string): boolean {
  return status !== 'void' && status !== 'draft'
}
