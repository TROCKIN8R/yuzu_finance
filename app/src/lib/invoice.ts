import type { OrganizationSettings, Project, TimeEntry } from './types'
import { effectiveRate, formatCad, lineAmount } from './format'

export interface LineTaxes {
  subtotal: number
  gst: number
  qst: number
  total: number
}

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

type TaxSettings = Pick<OrganizationSettings, 'charge_gst' | 'charge_qst' | 'gst_rate' | 'qst_rate'>

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function computeLineTaxes(subtotal: number, settings: TaxSettings): LineTaxes {
  const base = round2(subtotal)
  const gst = settings.charge_gst ? round2(base * settings.gst_rate) : 0
  const qst = settings.charge_qst ? round2(base * settings.qst_rate) : 0
  return { subtotal: base, gst, qst, total: round2(base + gst + qst) }
}

export function computeInvoiceTotals(subtotal: number, settings: TaxSettings): LineTaxes {
  return computeLineTaxes(subtotal, settings)
}

export function sumInvoiceLines(lines: Pick<LineTaxes, 'subtotal' | 'gst' | 'qst' | 'total'>[]): LineTaxes {
  const subtotal = lines.reduce((s, l) => s + Number(l.subtotal), 0)
  const gst = lines.reduce((s, l) => s + Number(l.gst), 0)
  const qst = lines.reduce((s, l) => s + Number(l.qst), 0)
  const total = lines.reduce((s, l) => s + Number(l.total), 0)
  return { subtotal: round2(subtotal), gst: round2(gst), qst: round2(qst), total: round2(total) }
}

export function buildLineFromTimeEntry(
  entry: TimeEntry,
  settings: TaxSettings,
  sortOrder: number
): InvoiceLineDraft {
  const project = entry.projects!
  const rate = effectiveRate(entry, project)
  const subtotal = lineAmount(Number(entry.hours), rate)
  const taxes = computeLineTaxes(subtotal, settings)
  return {
    project_id: entry.project_id,
    time_entry_id: entry.id,
    line_date: entry.entry_date,
    description: entry.description,
    quantity: Number(entry.hours),
    unit_label: 'h',
    unit_price: rate,
    ...taxes,
    sort_order: sortOrder,
  }
}

export function buildLineFromFixedProject(
  project: Project,
  settings: TaxSettings,
  sortOrder: number
): InvoiceLineDraft {
  const subtotal = Number(project.fixed_price ?? 0)
  const taxes = computeLineTaxes(subtotal, settings)
  return {
    project_id: project.id,
    time_entry_id: null,
    line_date: null,
    description: project.name,
    quantity: 1,
    unit_label: 'forfait',
    unit_price: subtotal,
    ...taxes,
    sort_order: sortOrder,
  }
}

export function buildLegacyLinesFromTimeEntries(
  entries: TimeEntry[],
  settings: TaxSettings
): InvoiceLineDraft[] {
  return entries.map((e, i) => buildLineFromTimeEntry(e, settings, i))
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
