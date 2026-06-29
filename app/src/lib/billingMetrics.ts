import { effectiveRate, lineAmount, relationOne } from './format'
import { inPeriod, type DateRange } from './fiscalPeriod'
import { isRevenueInvoice } from './taxes'
import type { BillingType } from './types'

export interface MetricsProject {
  id: string
  partner_id: string
  billing_type: BillingType
  fixed_price: number | null
  invoice_id: string | null
  status: string
  default_hourly_rate: number
  name?: string
  partners?: { legal_name: string } | { legal_name: string }[] | null
}

export interface MetricsTimeEntry {
  entry_date: string
  hours: number
  rate_override: number | null
  billable: boolean
  invoice_id: string | null
  project_id: string
  projects?: MetricsProject | MetricsProject[] | null
}

export interface WorkedRevenueMetrics {
  total: number
  hourly: number
  fixed: number
  hours: number
  hourlyHours: number
  fixedHours: number
}

export interface UnbilledWip {
  amount: number
  hours: number
  fixedAmount: number
  hourlyAmount: number
}

export interface BreakdownRow {
  id: string
  label: string
  worked: number
  invoiced: number
  collected: number
  hours: number
  avgRate: number | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function isFixedProject(project: Pick<MetricsProject, 'billing_type'>) {
  return project.billing_type === 'fixed'
}

export function hoursByProject(entries: MetricsTimeEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of entries) {
    map.set(entry.project_id, round2((map.get(entry.project_id) ?? 0) + Number(entry.hours)))
  }
  return map
}

export function hourlyEntryAmount(entry: MetricsTimeEntry, project: MetricsProject): number {
  if (!entry.billable || isFixedProject(project)) return 0
  return lineAmount(Number(entry.hours), effectiveRate(entry, project))
}

export function fixedProratedRevenue(project: MetricsProject, hoursInScope: number, totalProjectHours: number): number {
  const price = Number(project.fixed_price ?? 0)
  if (price <= 0 || hoursInScope <= 0 || totalProjectHours <= 0) return 0
  return round2(price * (hoursInScope / totalProjectHours))
}

export function computeWorkedRevenueMetrics(entries: MetricsTimeEntry[], period: DateRange): WorkedRevenueMetrics {
  const totals = hoursByProject(entries)
  let hourly = 0
  let fixed = 0
  let hourlyHours = 0
  let fixedHours = 0

  for (const entry of entries) {
    if (!inPeriod(entry.entry_date, period)) continue
    const project = relationOne(entry.projects)
    if (!project) continue
    const hours = Number(entry.hours)

    if (isFixedProject(project)) {
      fixedHours += hours
      fixed += fixedProratedRevenue(project, hours, totals.get(project.id) ?? hours)
    } else if (entry.billable) {
      hourlyHours += hours
      hourly += hourlyEntryAmount(entry, project)
    }
  }

  return {
    total: round2(hourly + fixed),
    hourly: round2(hourly),
    fixed: round2(fixed),
    hours: round2(hourlyHours + fixedHours),
    hourlyHours: round2(hourlyHours),
    fixedHours: round2(fixedHours),
  }
}

export function computeUnbilledWip(entries: MetricsTimeEntry[], fixedProjects: MetricsProject[]): UnbilledWip {
  let hourlyAmount = 0
  let hours = 0

  for (const entry of entries) {
    if (entry.invoice_id) continue
    const project = relationOne(entry.projects)
    if (!project || isFixedProject(project) || !entry.billable) continue
    hours += Number(entry.hours)
    hourlyAmount += hourlyEntryAmount(entry, project)
  }

  const fixedAmount = fixedProjects
    .filter((p) => isFixedProject(p) && !p.invoice_id && p.status !== 'archived')
    .reduce((sum, p) => sum + Number(p.fixed_price ?? 0), 0)

  return {
    amount: round2(hourlyAmount + fixedAmount),
    hours: round2(hours),
    fixedAmount: round2(fixedAmount),
    hourlyAmount: round2(hourlyAmount),
  }
}

export function averageRate(revenue: number, hours: number): number | null {
  if (hours <= 0) return null
  return round2(revenue / hours)
}

export function fixedWorkedInMonth(
  project: MetricsProject,
  entries: MetricsTimeEntry[],
  month: string,
  totalProjectHours: number
): number {
  const hoursInMonth = entries
    .filter((e) => e.project_id === project.id && e.entry_date.startsWith(month))
    .reduce((sum, e) => sum + Number(e.hours), 0)
  return fixedProratedRevenue(project, hoursInMonth, totalProjectHours)
}

type InvoiceRow = {
  id: string
  partner_id: string
  subtotal: number
  invoice_date: string
  status: string
}

type PaymentRow = {
  amount: number
  payment_date?: string | null
  invoice_id: string
}

type LineRow = {
  invoice_id: string
  subtotal: number
  unit_label: string
}

function invoicedByBillingType(lines: LineRow[], invoices: InvoiceRow[], period: DateRange): Record<BillingType, number> {
  const invoiceIds = new Set(
    invoices.filter((inv) => isRevenueInvoice(inv.status) && inPeriod(inv.invoice_date, period)).map((inv) => inv.id)
  )
  const totals: Record<BillingType, number> = { hourly: 0, fixed: 0 }
  for (const line of lines) {
    if (!invoiceIds.has(line.invoice_id)) continue
    const type: BillingType = line.unit_label === 'forfait' ? 'fixed' : 'hourly'
    totals[type] += Number(line.subtotal)
  }
  return { hourly: round2(totals.hourly), fixed: round2(totals.fixed) }
}

function invoicedByPartner(invoices: InvoiceRow[], period: DateRange): Map<string, number> {
  const map = new Map<string, number>()
  for (const inv of invoices) {
    if (!isRevenueInvoice(inv.status) || !inPeriod(inv.invoice_date, period)) continue
    map.set(inv.partner_id, round2((map.get(inv.partner_id) ?? 0) + Number(inv.subtotal)))
  }
  return map
}

function collectedByPartner(payments: PaymentRow[], invoices: InvoiceRow[], period: DateRange): Map<string, number> {
  const partnerByInvoice = new Map(invoices.map((inv) => [inv.id, inv.partner_id]))
  const map = new Map<string, number>()
  for (const payment of payments) {
    if (!payment.payment_date || !inPeriod(payment.payment_date, period)) continue
    const partnerId = partnerByInvoice.get(payment.invoice_id)
    if (!partnerId) continue
    map.set(partnerId, round2((map.get(partnerId) ?? 0) + Number(payment.amount)))
  }
  return map
}

function workedByPartner(entries: MetricsTimeEntry[], period: DateRange): Map<string, { worked: number; hours: number }> {
  const totals = hoursByProject(entries)
  const map = new Map<string, { worked: number; hours: number }>()

  const add = (partnerId: string, worked: number, hours: number) => {
    const prev = map.get(partnerId) ?? { worked: 0, hours: 0 }
    map.set(partnerId, { worked: round2(prev.worked + worked), hours: round2(prev.hours + hours) })
  }

  for (const entry of entries) {
    if (!inPeriod(entry.entry_date, period)) continue
    const project = relationOne(entry.projects)
    if (!project) continue
    const hours = Number(entry.hours)

    if (isFixedProject(project)) {
      add(project.partner_id, fixedProratedRevenue(project, hours, totals.get(project.id) ?? hours), hours)
    } else if (entry.billable) {
      add(project.partner_id, hourlyEntryAmount(entry, project), hours)
    }
  }

  return map
}

export function buildPartnerBreakdown(
  entries: MetricsTimeEntry[],
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  partners: { id: string; legal_name: string }[],
  period: DateRange
): BreakdownRow[] {
  const workedMap = workedByPartner(entries, period)
  const invoicedMap = invoicedByPartner(invoices, period)
  const collectedMap = collectedByPartner(payments, invoices, period)
  const partnerIds = new Set([
    ...workedMap.keys(),
    ...invoicedMap.keys(),
    ...collectedMap.keys(),
  ])

  const nameById = new Map(partners.map((p) => [p.id, p.legal_name]))

  return [...partnerIds]
    .map((id) => {
      const worked = workedMap.get(id)?.worked ?? 0
      const hours = workedMap.get(id)?.hours ?? 0
      const invoiced = invoicedMap.get(id) ?? 0
      const collected = collectedMap.get(id) ?? 0
      return {
        id,
        label: nameById.get(id) ?? 'Partenaire',
        worked,
        invoiced,
        collected,
        hours,
        avgRate: averageRate(worked, hours),
      }
    })
    .filter((row) => row.worked !== 0 || row.invoiced !== 0 || row.collected !== 0)
    .sort((a, b) => b.invoiced - a.invoiced || b.worked - a.worked)
}

export function buildServiceTypeBreakdown(
  entries: MetricsTimeEntry[],
  lines: LineRow[],
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  period: DateRange
): BreakdownRow[] {
  const worked = computeWorkedRevenueMetrics(entries, period)
  const invoiced = invoicedByBillingType(lines, invoices, period)

  const invoiceIdsInPeriod = invoices
    .filter((inv) => isRevenueInvoice(inv.status) && inPeriod(inv.invoice_date, period))
    .map((inv) => inv.id)
  const invoicedTotals = invoiceIdsInPeriod.reduce((sum, id) => {
    const inv = invoices.find((i) => i.id === id)
    return sum + Number(inv?.subtotal ?? 0)
  }, 0)

  const collectedTotal = payments
    .filter((p) => p.payment_date && inPeriod(p.payment_date, period))
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const types: { id: BillingType; label: string; worked: number; invoiced: number; hours: number }[] = [
    { id: 'hourly', label: 'Horaire', worked: worked.hourly, invoiced: invoiced.hourly, hours: worked.hourlyHours },
    { id: 'fixed', label: 'Forfait', worked: worked.fixed, invoiced: invoiced.fixed, hours: worked.fixedHours },
  ]

  return types
    .map((type) => {
      const share = invoicedTotals > 0 ? type.invoiced / invoicedTotals : 0
      return {
        id: type.id,
        label: type.label,
        worked: type.worked,
        invoiced: type.invoiced,
        collected: round2(collectedTotal * share),
        hours: type.hours,
        avgRate: averageRate(type.worked, type.hours),
      }
    })
    .filter((row) => row.worked !== 0 || row.invoiced !== 0 || row.collected !== 0)
}
