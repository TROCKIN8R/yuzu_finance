import type { MonthlySeriesPoint } from './dashboardSeries'
import {
  averageRate,
  computeWorkedRevenueMetrics,
  type MetricsTimeEntry,
} from './billingMetrics'
import { currentYearMonth, inPeriod, previousYearMonth, type DateRange } from './fiscalPeriod'
import type { FinancialSnapshot } from './financials'
import { invoicePaidThroughDate, outstandingSalesTaxOnPaidInvoices } from './salesTaxCalc'

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

/** Cash vs unpaid statutory dues at period end — draft for owner/CPA review. */
export interface EstimatedDues {
  cash: number
  cashFromBankImport: boolean
  /** Unremitted payroll: employee withholdings + employer statutory + HSF/CNESST (GL 2200+2210+2215). */
  payrollUnpaid: number
  salesTaxUnpaid: number
  companyTaxUnpaid: number
  corpTaxRate: number
  totalDue: number
  estimatedRemaining: number
}

export interface EstimatedDuesSource {
  invoices: { id: string; subtotal: number; gst: number; qst: number; total: number; status: string; invoice_date: string }[]
  payments: { invoice_id: string; payment_date?: string | null; amount: number }[]
  expenses: { gst: number; qst: number; expense_date: string; category?: string; payroll_run_id?: string | null }[]
  employeeExpenses?: {
    gst: number
    qst: number
    expense_date: string
    taxable?: boolean
    payroll_run_id?: string | null
  }[]
  salesTaxRemittances: { gst_net: number; qst_net: number; status?: string; filed_date?: string | null; period_end: string }[]
  estimatedCorpTaxRate: number
  asOf: string
}

/** (Paid-invoice HT − salary − costs) × estimated corp tax rate, minus tax already paid in the period. */
export function estimateCompanyTaxUnpaid(
  fin: FinancialSnapshot,
  rate: number,
  source: Pick<EstimatedDuesSource, 'invoices' | 'payments' | 'asOf'>
): number {
  const sales = round2(
    source.invoices
      .filter(
        (inv) =>
          inPeriod(inv.invoice_date, fin.period) && invoicePaidThroughDate(inv, source.payments, source.asOf)
      )
      .reduce((s, inv) => s + Number(inv.subtotal), 0)
  )
  const salary = fin.income.payrollGross
  const costs = round2(fin.income.operatingExpenses + fin.income.employerPayrollContributions)
  const taxable = Math.max(0, round2(sales - salary - costs))
  const estimated = round2(taxable * rate)
  return Math.max(0, round2(estimated - fin.corpTax.paid))
}

export function buildEstimatedDues(fin: FinancialSnapshot, source: EstimatedDuesSource): EstimatedDues {
  const bank = fin.balanceSheet.bankStatementBalance
  const cash = bank != null ? bank : fin.balanceSheet.cash
  const payrollUnpaid = Math.max(0, fin.balanceSheet.payrollRemittancesPending)
  const salesTaxUnpaid = outstandingSalesTaxOnPaidInvoices({
    asOf: source.asOf,
    invoices: source.invoices,
    payments: source.payments,
    expenses: source.expenses,
    employeeExpenses: source.employeeExpenses,
    remittances: source.salesTaxRemittances,
  })
  const companyTaxUnpaid = estimateCompanyTaxUnpaid(fin, source.estimatedCorpTaxRate, source)
  const totalDue = round2(payrollUnpaid + salesTaxUnpaid + companyTaxUnpaid)
  return {
    cash,
    cashFromBankImport: bank != null,
    payrollUnpaid,
    salesTaxUnpaid,
    companyTaxUnpaid,
    corpTaxRate: source.estimatedCorpTaxRate,
    totalDue,
    estimatedRemaining: round2(cash - totalDue),
  }
}

export { averageRate, computeWorkedRevenueMetrics }
