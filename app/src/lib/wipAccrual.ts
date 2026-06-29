import { computeUnbilledWip, type MetricsProject, type MetricsTimeEntry } from './billingMetrics'
import { lastDayOfMonth, monthsInRange } from './fiscalPeriod'
import type { JournalEntry, JournalLine } from './generalLedger'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function balance1300ThroughDate(entries: JournalEntry[], throughDate: string): number {
  let debit = 0
  let credit = 0
  for (const e of entries) {
    if (e.date > throughDate) continue
    for (const line of e.lines) {
      if (line.accountCode !== '1300') continue
      debit += line.debit
      credit += line.credit
    }
  }
  return round2(debit - credit)
}

export function computeUnbilledWipAsOf(
  entries: MetricsTimeEntry[],
  fixedProjects: MetricsProject[],
  asOfDate: string,
  invoiceDates: Map<string, string>
): ReturnType<typeof computeUnbilledWip> {
  const filteredEntries = entries.filter((e) => {
    if (e.entry_date > asOfDate) return false
    if (!e.invoice_id) return true
    const invDate = invoiceDates.get(e.invoice_id)
    return !invDate || invDate > asOfDate
  })

  const filteredProjects = fixedProjects.filter((p) => {
    if (p.status === 'archived') return false
    if (!p.invoice_id) return true
    const invDate = invoiceDates.get(p.invoice_id)
    return !invDate || invDate > asOfDate
  })

  return computeUnbilledWip(filteredEntries, filteredProjects)
}

export function buildWipAccrualEntries(params: {
  entriesBeforeWip: JournalEntry[]
  timeEntries: MetricsTimeEntry[]
  fixedProjects: MetricsProject[]
  invoiceDates: Map<string, string>
  periodEnd: string
  periodStart?: string
}): JournalEntry[] {
  const { entriesBeforeWip, timeEntries, fixedProjects, invoiceDates, periodEnd } = params
  const periodStart = params.periodStart ?? '2000-01-01'
  if (timeEntries.length === 0 && fixedProjects.length === 0) return []

  const firstDate = timeEntries.reduce(
    (min, e) => (e.entry_date < min ? e.entry_date : min),
    timeEntries[0]?.entry_date ?? periodEnd
  )
  const rangeStart = firstDate.slice(0, 7) < periodStart.slice(0, 7) ? firstDate.slice(0, 7) : periodStart.slice(0, 7)
  const months = monthsInRange(`${rangeStart}-01`, periodEnd, periodEnd)
  const wipEntries: JournalEntry[] = []
  const combined = [...entriesBeforeWip]

  for (const ym of months) {
    const asOf = lastDayOfMonth(ym)
    if (asOf > periodEnd) continue
    const target = computeUnbilledWipAsOf(timeEntries, fixedProjects, asOf, invoiceDates).amount
    const current1300 = balance1300ThroughDate([...combined, ...wipEntries], asOf)
    const delta = round2(target - current1300)
    if (Math.abs(delta) < 0.01) continue

    const lines: JournalLine[] =
      delta > 0
        ? [
            { accountCode: '1300', accountName: 'Revenus non facturés', debit: delta, credit: 0 },
            { accountCode: '4000', accountName: 'Revenus de services', debit: 0, credit: delta },
          ]
        : [
            { accountCode: '4000', accountName: 'Revenus de services', debit: Math.abs(delta), credit: 0 },
            { accountCode: '1300', accountName: 'Revenus non facturés', debit: 0, credit: Math.abs(delta) },
          ]

    const entry: JournalEntry = {
      id: `wip-${ym}`,
      date: asOf,
      sourceType: 'wip_accrual',
      sourceId: ym,
      reference: ym,
      description: `Constat de revenus non facturés (WIP) — ${ym}`,
      lines,
    }
    wipEntries.push(entry)
  }

  return wipEntries
}
