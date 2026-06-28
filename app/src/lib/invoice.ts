import type { OrganizationSettings } from './types'

export function computeInvoiceTotals(
  subtotal: number,
  settings: Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'>
) {
  const gst = settings.charge_gst ? round2(subtotal * settings.gst_rate) : 0
  const qst = settings.charge_qst ? round2(subtotal * settings.qst_rate) : 0
  return { subtotal: round2(subtotal), gst, qst, total: round2(subtotal + gst + qst) }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function invoiceBalance(total: number, paid: number) {
  return round2(total - paid)
}

export function deriveInvoiceStatus(
  total: number,
  paid: number,
  current: string
): 'draft' | 'sent' | 'partial' | 'paid' | 'void' {
  if (current === 'void') return 'void'
  if (paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return current === 'draft' ? 'draft' : 'sent'
}
