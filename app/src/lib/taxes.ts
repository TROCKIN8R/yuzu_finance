import type { OrganizationSettings } from './types'

export type TaxSettings = Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'> &
  Partial<Pick<OrganizationSettings, 'gst_number' | 'qst_number'>>

export type TaxBreakdown = {
  subtotal: number
  gst: number
  qst: number
  total: number
}

export const QUEBEC_DEFAULT_GST_RATE = 0.05
export const QUEBEC_DEFAULT_QST_RATE = 0.09975

/**
 * Commercial half-up rounding to the cent (Revenu Québec / CRA style).
 * Avoids common float artifacts around .xx5 boundaries.
 */
export function round2(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100
}

/** Registered for sales tax when a TPS or TVQ number is on file. */
export function hasSalesTaxNumbers(
  settings: Pick<OrganizationSettings, 'gst_number' | 'qst_number'> | null | undefined
): boolean {
  return Boolean(settings?.gst_number?.trim() || settings?.qst_number?.trim())
}

/** New invoices include TPS/TVQ when the org has registration numbers. */
export function defaultIncludeSalesTax(
  settings: Pick<OrganizationSettings, 'gst_number' | 'qst_number'> | null | undefined
): boolean {
  return hasSalesTaxNumbers(settings)
}

/** Apply per-invoice include flag. A filled TPS/TVQ number counts as registered for that tax. */
export function effectiveTaxSettings(settings: TaxSettings, includeSalesTax: boolean): TaxSettings {
  if (!includeSalesTax) {
    return { ...settings, charge_gst: false, charge_qst: false }
  }
  return {
    ...settings,
    charge_gst: settings.charge_gst || Boolean(settings.gst_number?.trim()),
    charge_qst: settings.charge_qst || Boolean(settings.qst_number?.trim()),
  }
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

function fallbackSettings(): TaxSettings {
  return {
    charge_gst: false,
    charge_qst: false,
    gst_rate: QUEBEC_DEFAULT_GST_RATE,
    qst_rate: QUEBEC_DEFAULT_QST_RATE,
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
  const t = computePurchaseTaxesFromTotal(total, settings ?? fallbackSettings())
  return { amount: t.subtotal, gst: t.gst, qst: t.qst, total: t.total }
}

/** Build TTC + taxes from a HT purchase amount. */
export function splitPurchaseAmount(
  amountExclTax: number,
  applyTax: boolean,
  settings: TaxSettings | null | undefined
) {
  const amount = round2(Math.abs(amountExclTax))
  if (!applyTax || amount <= 0) {
    return { amount, gst: 0, qst: 0, total: amount }
  }
  const t = computePurchaseTaxes(amount, settings ?? fallbackSettings())
  return { amount: t.subtotal, gst: t.gst, qst: t.qst, total: t.total }
}

/**
 * Québec sales tax since 1 Jan 2013 (CITCA / Revenu Québec):
 * TPS and TVQ apply in parallel on the same tax-exclusive consideration.
 * Do not calculate TVQ on HT+TPS — that was the pre-2013 9.5% stacked rule.
 * Each tax is rounded to the cent (half-up).
 */
export function computeSalesTaxes(subtotal: number, settings: TaxSettings): TaxBreakdown {
  const base = round2(subtotal)
  const gst = settings.charge_gst ? round2(base * settings.gst_rate) : 0
  const qst = settings.charge_qst ? round2(base * settings.qst_rate) : 0
  return { subtotal: base, gst, qst, total: round2(base + gst + qst) }
}

/** ITC / RTI on purchases — same Québec parallel rule as sales. */
export function computePurchaseTaxes(amount: number, settings: TaxSettings): TaxBreakdown {
  return computeSalesTaxes(amount, purchaseReceiptTaxSettings(settings))
}

/**
 * Back-calculate HT + TPS/TVQ from a TTC purchase total (Québec parallel taxes).
 *
 * 1. Guess HT = round(TTC / (1 + TPS + TVQ))
 * 2. Search nearby cents for an HT whose forward-rounded taxes equal the entered TTC
 *    (matches how most invoices are printed: HT first, then rounded taxes)
 * 3. If no exact match, keep the closest HT/TPS and put the residual cent(s) on TVQ
 *    so HT + TPS + TVQ always equals the entered TTC
 */
export function computePurchaseTaxesFromTotal(totalInclTax: number, settings: TaxSettings): TaxBreakdown {
  const total = round2(Math.abs(totalInclTax))
  const receiptSettings = purchaseReceiptTaxSettings(settings)
  if (!receiptSettings.charge_gst && !receiptSettings.charge_qst) {
    return { subtotal: total, gst: 0, qst: 0, total }
  }

  const gstRate = receiptSettings.charge_gst ? receiptSettings.gst_rate : 0
  const qstRate = receiptSettings.charge_qst ? receiptSettings.qst_rate : 0
  const divisor = 1 + gstRate + qstRate
  const guessed = round2(total / divisor)

  let best = computeSalesTaxes(guessed, receiptSettings)
  let bestDiff = Math.abs(best.total - total)

  // Search ±5¢ — enough to absorb per-cent rounding drift on typical receipt amounts
  for (let delta = -5; delta <= 5; delta++) {
    if (delta === 0) continue
    const candidateHt = round2(guessed + delta / 100)
    if (candidateHt < 0) continue
    const candidate = computeSalesTaxes(candidateHt, receiptSettings)
    const diff = Math.abs(candidate.total - total)
    if (diff < bestDiff) {
      best = candidate
      bestDiff = diff
      if (diff === 0) break
    }
  }

  if (bestDiff === 0) {
    return { ...best, total }
  }

  // No exact forward match: force TTC identity with residual on the last tax line (TVQ, else TPS)
  if (receiptSettings.charge_qst) {
    const qst = round2(total - best.subtotal - best.gst)
    return { subtotal: best.subtotal, gst: best.gst, qst, total }
  }
  const gst = round2(total - best.subtotal)
  return { subtotal: best.subtotal, gst, qst: 0, total }
}

export function isRevenueInvoice(status: string): boolean {
  return status !== 'void' && status !== 'draft'
}

/** Payment counts toward AR/cash only when linked invoice is collectible. */
export function isCollectiblePayment(invoiceStatus: string | undefined): boolean {
  return Boolean(invoiceStatus && invoiceStatus !== 'void' && invoiceStatus !== 'draft')
}
