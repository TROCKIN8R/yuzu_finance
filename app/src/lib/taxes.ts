import type { OrganizationSettings } from './types'

export type TaxSettings = Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'>

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Apply per-invoice include flag on top of organization tax registration. */
export function effectiveTaxSettings(settings: TaxSettings, includeSalesTax: boolean): TaxSettings {
  if (!includeSalesTax) {
    return { ...settings, charge_gst: false, charge_qst: false }
  }
  return settings
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

/** Back-calculate HT + TPS/TVQ from a TTC purchase total (Québec compound). */
export function computePurchaseTaxesFromTotal(totalInclTax: number, settings: TaxSettings) {
  const total = round2(Math.abs(totalInclTax))
  if (!settings.charge_gst && !settings.charge_qst) {
    return { subtotal: total, gst: 0, qst: 0, total }
  }
  const gstRate = settings.charge_gst ? settings.gst_rate : 0
  const qstRate = settings.charge_qst ? settings.qst_rate : 0
  const divisor = (1 + gstRate) * (1 + qstRate)
  const subtotal = round2(total / divisor)
  const taxes = computeSalesTaxes(subtotal, settings)
  return { ...taxes, total: round2(taxes.subtotal + taxes.gst + taxes.qst) }
}

export function isRevenueInvoice(status: string): boolean {
  return status !== 'void' && status !== 'draft'
}

/** Payment counts toward AR/cash only when linked invoice is collectible. */
export function isCollectiblePayment(invoiceStatus: string | undefined): boolean {
  return Boolean(invoiceStatus && invoiceStatus !== 'void' && invoiceStatus !== 'draft')
}
