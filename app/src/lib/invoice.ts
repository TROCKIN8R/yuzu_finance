import type { Project, TimeEntry } from './types'
import { effectiveRate, formatCad, lineAmount } from './format'
import { computeSalesTaxes, round2, type TaxSettings } from './taxes'

export type LineTaxes = ReturnType<typeof computeSalesTaxes>

export interface InvoiceLineDraft {
  project_id: string | null
  time_entry_id: string | null
  line_date: string | null
  description: string
  quantity: number
  unit_label: string
  unit_price: number
  subtotal: number
  gst: number
  qst: number
  total: number
  sort_order: number
}

/** Line amounts are always HT. TPS/TVQ are applied once on the invoice sous-total. */
export function htLineTotals(subtotal: number): LineTaxes {
  const base = round2(subtotal)
  return { subtotal: base, gst: 0, qst: 0, total: base }
}

export function computeInvoiceTotals(subtotal: number, settings: TaxSettings): LineTaxes {
  return computeSalesTaxes(subtotal, settings)
}

export function invoiceTotalsFromLines(
  lines: Pick<LineTaxes, 'subtotal'>[],
  settings: TaxSettings
): LineTaxes {
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.subtotal), 0))
  return computeSalesTaxes(subtotal, settings)
}

export function buildLineFromTimeEntry(entry: TimeEntry, sortOrder: number): InvoiceLineDraft {
  const project = entry.projects!
  const rate = effectiveRate(entry, project)
  const subtotal = lineAmount(Number(entry.hours), rate)
  return {
    project_id: entry.project_id,
    time_entry_id: entry.id,
    line_date: entry.entry_date,
    description: entry.description?.trim() || 'Travail',
    quantity: Number(entry.hours),
    unit_label: 'h',
    unit_price: rate,
    ...htLineTotals(subtotal),
    sort_order: sortOrder,
  }
}

export function buildLineFromFixedProject(project: Project, sortOrder: number): InvoiceLineDraft {
  const subtotal = Number(project.fixed_price ?? 0)
  return {
    project_id: project.id,
    time_entry_id: null,
    line_date: null,
    description: project.name,
    quantity: 1,
    unit_label: 'forfait',
    unit_price: subtotal,
    ...htLineTotals(subtotal),
    sort_order: sortOrder,
  }
}

export function buildLegacyLinesFromTimeEntries(entries: TimeEntry[]): InvoiceLineDraft[] {
  return entries.map((e, i) => buildLineFromTimeEntry(e, i))
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

export function billingTypeLabel(type: string): string {
  return type === 'fixed' ? 'Forfait' : 'Horaire'
}

export function projectAmountLabel(project: Pick<Project, 'billing_type' | 'default_hourly_rate' | 'fixed_price'>): string {
  if (project.billing_type === 'fixed') {
    return project.fixed_price != null ? formatCad(project.fixed_price) : '—'
  }
  return `${formatCad(project.default_hourly_rate)}/h`
}

/** Distinct non-empty PO / BC numbers from projects linked to an invoice. */
export function distinctPoNumbers(projects: Pick<Project, 'po_number'>[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const project of projects) {
    const po = project.po_number?.trim()
    if (!po || seen.has(po)) continue
    seen.add(po)
    out.push(po)
  }
  return out
}
