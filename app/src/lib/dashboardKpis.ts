import type { MonthlySeriesPoint } from './dashboardSeries'
import {
  averageRate,
  computeWorkedRevenueMetrics,
  type MetricsTimeEntry,
} from './billingMetrics'
import { currentYearMonth, previousYearMonth, type DateRange } from './fiscalPeriod'

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

export function computeWorkedRevenue(entries: MetricsTimeEntry[], period: DateRange): number {
  return computeWorkedRevenueMetrics(entries, period).total
}

export function computeWorkedHours(entries: MetricsTimeEntry[], period: DateRange): number {
  return computeWorkedRevenueMetrics(entries, period).hours
}

export function momFromSeries(
  points: MonthlySeriesPoint[],
  pick: (p: MonthlySeriesPoint) => number,
  ref: Date = new Date()
): MomChange {
  if (points.length === 0) return computeMomChange(0, 0)

  const byMonth = new Map(points.map((p) => [p.month, p]))
  const currentYm = currentYearMonth(ref)
  const currentPt = byMonth.get(currentYm)

  if (currentPt) {
    const priorPt = byMonth.get(previousYearMonth(currentYm))
    return computeMomChange(pick(currentPt), priorPt ? pick(priorPt) : 0)
  }

  const last = points[points.length - 1]
  const priorPt = byMonth.get(previousYearMonth(last.month)) ?? (points.length >= 2 ? points[points.length - 2] : undefined)
  return computeMomChange(pick(last), priorPt ? pick(priorPt) : 0)
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

export { averageRate, computeWorkedRevenueMetrics }
