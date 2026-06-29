import { effectiveRate, lineAmount, relationOne } from './format'
import { inPeriod, type DateRange } from './fiscalPeriod'
import type { MonthlySeriesPoint } from './dashboardSeries'

export interface MomChange {
  current: number
  prior: number
  pct: number | null
  direction: 'up' | 'down' | 'flat' | 'na'
}

export interface ServiceKpiTrends {
  workedRevenue: MomChange
  invoicedRevenue: MomChange
  cashCollected: MomChange
  operatingIncome: MomChange
  payrollTotal: MomChange
}

type TimeEntryRow = {
  entry_date: string
  hours: number
  rate_override: number | null
  billable: boolean
  projects?: { default_hourly_rate: number } | { default_hourly_rate: number }[] | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function computeMomChange(current: number, prior: number): MomChange {
  if (prior === 0 && current === 0) {
    return { current, prior, pct: 0, direction: 'flat' }
  }
  if (prior === 0) {
    return { current, prior, pct: null, direction: current > 0 ? 'up' : 'flat' }
  }
  const pct = round2(((current - prior) / Math.abs(prior)) * 100)
  const direction = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'
  return { current, prior, pct, direction }
}

/** Previous calendar month (full month). */
export function priorCalendarMonth(ref: Date = new Date()): DateRange {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const label = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' }).format(start)
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    label,
  }
}

export function computeWorkedRevenue(entries: TimeEntryRow[], period: DateRange): number {
  let total = 0
  for (const e of entries) {
    if (!e.billable || !inPeriod(e.entry_date, period)) continue
    const p = relationOne<{ default_hourly_rate: number }>(e.projects)
    if (!p) continue
    total += lineAmount(Number(e.hours), effectiveRate(e, p))
  }
  return round2(total)
}

export function computeWorkedHours(entries: TimeEntryRow[], period: DateRange): number {
  let total = 0
  for (const e of entries) {
    if (!e.billable || !inPeriod(e.entry_date, period)) continue
    total += Number(e.hours)
  }
  return round2(total)
}

/** MoM from the last two months in a chart series. */
export function momFromSeries(
  points: MonthlySeriesPoint[],
  pick: (p: MonthlySeriesPoint) => number
): MomChange {
  if (points.length < 2) {
    const last = points.at(-1)
    return computeMomChange(last ? pick(last) : 0, 0)
  }
  const current = pick(points[points.length - 1])
  const prior = pick(points[points.length - 2])
  return computeMomChange(current, prior)
}

export function buildServiceKpiTrends(points: MonthlySeriesPoint[]): ServiceKpiTrends {
  return {
    workedRevenue: momFromSeries(points, (p) => p.workedRevenue),
    invoicedRevenue: momFromSeries(points, (p) => p.invoicedRevenue),
    cashCollected: momFromSeries(points, (p) => p.cashIn),
    operatingIncome: momFromSeries(points, (p) => p.operatingIncome),
    payrollTotal: momFromSeries(points, (p) => p.payrollCost),
  }
}

export function operatingMarginPct(revenue: number, operatingIncome: number): number | null {
  if (revenue === 0) return null
  return round2((operatingIncome / revenue) * 100)
}
