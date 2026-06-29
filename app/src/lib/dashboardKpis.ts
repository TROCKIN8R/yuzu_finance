import type { MonthlySeriesPoint } from './dashboardSeries'
import {
  averageRate,
  computeWorkedRevenueMetrics,
  type MetricsTimeEntry,
} from './billingMetrics'
import type { DateRange } from './fiscalPeriod'

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

export { averageRate, computeWorkedRevenueMetrics }
