import type { OrganizationSettings } from './types'

export type TaxSettings = Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'>

export const QUEBEC_DEFAULT_GST_RATE = 0.05
export const QUEBEC_DEFAULT_QST_RATE = 0.09975

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

/** Purchase receipts: split using statutory rates for ITC/RTI — not sales charge flags. */
function purchaseReceiptTaxSettings(settings: TaxSettings): TaxSettings {
  const gstRaw = Number(settings.gst_rate)
  const qstRaw = Number(settings.qst_rate)
  const gst_rate = Number.isFinite(gstRaw) && gstRaw > 0 ? gstRaw : QUEBEC_DEFAULT_GST_RATE
  const qst_rate = Number.isFinite(qstRaw) && qstRaw > 0 ? qstRaw : QUEBEC_DEFAULT_QST_RATE
  return {
    ...settings,
    gst_rate,
    qst_rate,
    charge_gst: true,
    charge_qst: true,
  }
}

/** Split a TTC purchase total into HT + TPS/TVQ (employee expenses, bank expenses). */
export function splitPurchaseTotal(
  totalInclTax: number,
  applyTax: boolean,
  settings: TaxSettings | null | undefined
) {
  const total = round2(Math.abs(totalInclTax))
  if (!applyTax || total <= 0) {
    return { amount: total, gst: 0, qst: 0, total }
  }
  const fallback: TaxSettings = {
    charge_gst: false,
    charge_qst: false,
    gst_rate: QUEBEC_DEFAULT_GST_RATE,
    qst_rate: QUEBEC_DEFAULT_QST_RATE,
  }
  const t = computePurchaseTaxesFromTotal(total, settings ?? fallback)
  return { amount: t.subtotal, gst: t.gst, qst: t.qst, total: t.total }
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
  return computeSalesTaxes(amount, purchaseReceiptTaxSettings(settings))
}

/** Back-calculate HT + TPS/TVQ from a TTC purchase total (Québec compound). */
export function computePurchaseTaxesFromTotal(totalInclTax: number, settings: TaxSettings) {
  const total = round2(Math.abs(totalInclTax))
  const receiptSettings = purchaseReceiptTaxSettings(settings)
  if (!receiptSettings.charge_gst && !receiptSettings.charge_qst) {
    return { subtotal: total, gst: 0, qst: 0, total }
  }
  const gstRate = receiptSettings.charge_gst ? receiptSettings.gst_rate : 0
  const qstRate = receiptSettings.charge_qst ? receiptSettings.qst_rate : 0
  const divisor = (1 + gstRate) * (1 + qstRate)
  const subtotal = round2(total / divisor)
  const taxes = computeSalesTaxes(subtotal, receiptSettings)
  return { ...taxes, total: round2(taxes.subtotal + taxes.gst + taxes.qst) }
}

export function isRevenueInvoice(status: string): boolean {
  return status !== 'void' && status !== 'draft'
}

/** Payment counts toward AR/cash only when linked invoice is collectible. */
export function isCollectiblePayment(invoiceStatus: string | undefined): boolean {
  return Boolean(invoiceStatus && invoiceStatus !== 'void' && invoiceStatus !== 'draft')
}
