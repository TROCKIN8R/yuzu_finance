import type { MetricsTimeEntry } from './billingMetrics'
import type { TaxSettings } from './taxes'
import type { InvoiceLineDraft } from './invoice'
import { computeLineTaxes } from './invoice'
import { effectiveRate, lineAmount, relationOne } from './format'
import type { Project, TimeEntry, TimeEntryLine } from './types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export type TimeEntryWithLines = TimeEntry & { time_entry_lines?: TimeEntryLine[] | null }

/** Partial rows from TIME_ENTRY_SELECT — enough for metrics and invoice grouping. */
export type TimeEntrySheetSource = {
  id?: string
  entry_date: string
  hours: number
  rate_override: number | null
  billable: boolean
  invoice_id: string | null
  project_id: string
  description?: string | null
  time_entry_lines?: Array<Pick<TimeEntryLine, 'hours' | 'billable' | 'item_name'>> | null
  projects?: MetricsTimeEntry['projects']
}

export type TimeEntryLineDraft = {
  id?: string
  item_name: string
  hours: number
  notes: string
  billable: boolean
}

export function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function resolveItemName(input: string, knownNames: string[]): string {
  const norm = normalizeItemName(input)
  if (!norm) return norm
  const match = knownNames.find((n) => n.toLowerCase() === norm.toLowerCase())
  return match ?? norm
}

export function totalLineHours(lines: Pick<TimeEntryLineDraft, 'hours'>[]): number {
  return round2(lines.reduce((s, l) => s + Number(l.hours || 0), 0))
}

export function entryHasBillableLines(lines: Pick<TimeEntryLineDraft, 'billable' | 'hours'>[]): boolean {
  return lines.some((l) => l.billable && Number(l.hours) > 0)
}

export function sheetSummary(lines: Pick<TimeEntryLine, 'item_name' | 'hours'>[]): string {
  if (lines.length === 0) return '—'
  return lines.map((l) => `${l.item_name} ${Number(l.hours)}h`).join(' · ')
}

export type FlatTimeLine = MetricsTimeEntry & { item_name: string; time_entry_id: string }

export function flattenEntryLines(entry: TimeEntrySheetSource): FlatTimeLine[] {
  const lines = entry.time_entry_lines ?? []
  const projects = entry.projects
  if (lines.length === 0 && Number(entry.hours) > 0) {
    return [
      {
        entry_date: entry.entry_date,
        hours: Number(entry.hours),
        rate_override: entry.rate_override,
        billable: entry.billable,
        invoice_id: entry.invoice_id,
        project_id: entry.project_id,
        item_name: entry.description?.trim() || 'Travail',
        time_entry_id: entry.id ?? entry.project_id,
        projects,
      },
    ]
  }
  return lines.map((line) => ({
    entry_date: entry.entry_date,
    hours: Number(line.hours),
    rate_override: entry.rate_override,
    billable: line.billable,
    invoice_id: entry.invoice_id,
    project_id: entry.project_id,
    item_name: line.item_name,
    time_entry_id: entry.id ?? entry.project_id,
    projects,
  }))
}

export function flattenAllEntryLines(entries: TimeEntrySheetSource[]): FlatTimeLine[] {
  return entries.flatMap(flattenEntryLines)
}

export function entriesToMetrics(entries: TimeEntrySheetSource[]): MetricsTimeEntry[] {
  return flattenAllEntryLines(entries).map(({ item_name: _item, time_entry_id: _id, ...metric }) => metric)
}

export function sheetBillableAmount(
  entry: TimeEntryWithLines,
  project?: Pick<Project, 'default_hourly_rate' | 'billing_type'> | null
): number {
  const proj = project ?? relationOne(entry.projects)
  if (!proj) return 0
  return round2(
    flattenEntryLines(entry)
      .filter((l) => l.billable)
      .reduce((s, l) => s + lineAmount(Number(l.hours), effectiveRate(l, proj)), 0)
  )
}

export function buildGroupedLinesFromTimeSheets(
  entries: TimeEntrySheetSource[],
  settings: TaxSettings
): InvoiceLineDraft[] {
  const flat = flattenAllEntryLines(entries).filter((l) => l.billable)
  const groups = new Map<
    string,
    { item_name: string; project_id: string; hours: number; rate: number }
  >()

  for (const line of flat) {
    const project = relationOne(line.projects)
    if (!project) continue
    const rate = effectiveRate(line, project)
    const key = `${line.project_id}\0${line.item_name.toLowerCase()}\0${rate}`
    const prev = groups.get(key)
    if (prev) {
      prev.hours = round2(prev.hours + Number(line.hours))
    } else {
      groups.set(key, {
        item_name: line.item_name,
        project_id: line.project_id,
        hours: Number(line.hours),
        rate,
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.item_name.localeCompare(b.item_name, 'fr'))
    .map((g, sortOrder) => {
      const subtotal = lineAmount(g.hours, g.rate)
      const taxes = computeLineTaxes(subtotal, settings)
      return {
        project_id: g.project_id,
        time_entry_id: null,
        line_date: null,
        description: g.item_name,
        quantity: g.hours,
        unit_label: 'h',
        unit_price: g.rate,
        ...taxes,
        sort_order: sortOrder,
      }
    })
}

export async function fetchItemNameSuggestions(projectId: string): Promise<string[]> {
  const { supabase } = await import('./supabase')
  const { data: entries } = await supabase.from('time_entries').select('id').eq('project_id', projectId)
  const entryIds = (entries ?? []).map((e) => e.id)
  if (entryIds.length === 0) return []

  const { data: lines } = await supabase
    .from('time_entry_lines')
    .select('item_name, created_at')
    .in('time_entry_id', entryIds)
    .order('created_at', { ascending: false })

  const seen = new Map<string, string>()
  for (const row of lines ?? []) {
    const name = normalizeItemName(row.item_name)
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}
