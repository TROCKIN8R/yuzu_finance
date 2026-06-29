import { relationOne } from './format'
import {
  fixedProratedRevenue,
  hourlyEntryAmount,
  hoursByProject,
  isFixedProject,
  type MetricsProject,
  type MetricsTimeEntry,
} from './billingMetrics'
import { payrollEmployerTotal } from './financials'
import type { DateRange } from './fiscalPeriod'
import { isRevenueInvoice } from './taxes'

export interface MonthlySeriesPoint {
  month: string
  label: string
  /** Invoiced revenue (HT) — alias kept for chart compatibility */
  revenue: number
  invoicedRevenue: number
  workedRevenue: number
  payrollCost: number
  operatingExpenses: number
  operatingIncome: number
  cashIn: number
  cashOut: number
  netCashFlow: number
  equity: number
}

export interface EquityBreakdown {
  shareCapital: number
  retainedEarnings: number
  totalEquity: number
}

type InvoiceRow = {
  subtotal: number
  invoice_date: string
  status: string
}

type PaymentRow = { amount: number; payment_date?: string }
type ExpenseRow = {
  total: number
  paid: boolean
  amount: number
  category?: string
  payroll_run_id?: string | null
  expense_date: string
}
type PayrollRow = {
  payment_date: string
  remittance_status?: string
  remittance_date?: string | null
  gross_pay: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  employer_benefits: number
  net_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  other_deductions: number
}
type DividendRow = {
  total_amount: number
  paid_amount?: number
  declared_date: string
  payment_date: string | null
  status: string
}

type TimeEntryRow = MetricsTimeEntry & {
  project_id: string
  projects?: MetricsProject | MetricsProject[] | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-CA', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1))
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

export function chartMonths(period: DateRange, ref = new Date()): string[] {
  if (period.start && period.end) {
    return monthsBetween(period.start, period.end)
  }
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function isOperatingExpense(e: ExpenseRow) {
  return e.category !== 'payroll' && !e.payroll_run_id
}

function payrollRemittanceAmount(p: PayrollRow) {
  const withholdings =
    Number(p.federal_tax) +
    Number(p.provincial_tax) +
    Number(p.cpp_employee) +
    Number(p.ei_employee) +
    Number(p.qpip_employee) +
    Number(p.other_deductions)
  const employer =
    Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer) + Number(p.employer_benefits)
  return withholdings + employer - Number(p.employer_benefits)
}

export function buildMonthlySeries(
  data: {
    invoices: InvoiceRow[]
    payments: PaymentRow[]
    expenses: ExpenseRow[]
    payrollRuns: PayrollRow[]
    timeEntries?: TimeEntryRow[]
    dividends: DividendRow[]
    corporateTax: { paid_amount: number; paid_date?: string | null }[]
    salesTaxRemitted: { gst_net: number; qst_net: number; filed_date?: string | null; period_end: string }[]
    settings?: {
      share_capital?: number
      opening_retained_earnings?: number
      opening_cash_balance?: number
      estimated_corp_tax_rate?: number
    }
    invoicePaidMap?: Record<string, number>
  },
  period: DateRange
): MonthlySeriesPoint[] {
  const months = chartMonths(period)
  if (months.length === 0) return []

  const revenueByMonth = new Map<string, number>()
  const workedByMonth = new Map<string, number>()
  const cashInByMonth = new Map<string, number>()
  const cashOutByMonth = new Map<string, number>()
  const opexByMonth = new Map<string, number>()
  const payrollByMonth = new Map<string, number>()
  const dividendsByMonth = new Map<string, number>()

  const add = (map: Map<string, number>, ym: string, amount: number) => {
    map.set(ym, round2((map.get(ym) ?? 0) + amount))
  }

  for (const inv of data.invoices) {
    if (!isRevenueInvoice(inv.status)) continue
    const ym = monthKey(inv.invoice_date)
    if (!months.includes(ym)) continue
    add(revenueByMonth, ym, Number(inv.subtotal))
  }

  for (const p of data.payments) {
    if (!p.payment_date) continue
    const ym = monthKey(p.payment_date)
    if (!months.includes(ym)) continue
    add(cashInByMonth, ym, Number(p.amount))
  }

  const entries = data.timeEntries ?? []
  const projectHours = hoursByProject(entries)

  for (const e of entries) {
    const ym = monthKey(e.entry_date)
    if (!months.includes(ym)) continue
    const proj = relationOne(e.projects)
    if (!proj) continue

    if (isFixedProject(proj)) {
      add(
        workedByMonth,
        ym,
        fixedProratedRevenue(proj, Number(e.hours), projectHours.get(proj.id) ?? Number(e.hours))
      )
    } else if (e.billable) {
      add(workedByMonth, ym, hourlyEntryAmount(e, proj))
    }
  }

  for (const e of data.expenses) {
    if (!isOperatingExpense(e)) continue
    const ym = monthKey(e.expense_date)
    if (!months.includes(ym)) continue
    add(opexByMonth, ym, Number(e.amount))
    if (e.paid) add(cashOutByMonth, ym, Number(e.total))
  }

  for (const p of data.payrollRuns) {
    const ym = monthKey(p.payment_date)
    if (months.includes(ym)) {
      add(payrollByMonth, ym, payrollEmployerTotal(p))
      add(cashOutByMonth, ym, Number(p.net_pay))
      add(cashOutByMonth, ym, Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer) + Number(p.employer_benefits))
    }
    if (p.remittance_status === 'remitted' && p.remittance_date) {
      const rym = monthKey(p.remittance_date)
      if (months.includes(rym)) add(cashOutByMonth, rym, payrollRemittanceAmount(p))
    }
  }

  for (const d of data.dividends) {
    const declareYm = monthKey(d.declared_date)
    if (months.includes(declareYm)) add(dividendsByMonth, declareYm, Number(d.total_amount))

    if (Number(d.paid_amount ?? 0) > 0 && d.payment_date) {
      const payYm = monthKey(d.payment_date)
      if (months.includes(payYm)) add(cashOutByMonth, payYm, Number(d.paid_amount))
    }
  }

  for (const t of data.corporateTax) {
    if (!t.paid_date) continue
    const ym = monthKey(t.paid_date)
    if (!months.includes(ym)) continue
    add(cashOutByMonth, ym, Number(t.paid_amount))
  }

  for (const st of data.salesTaxRemitted) {
    const date = st.filed_date ?? st.period_end
    const ym = monthKey(date)
    if (!months.includes(ym)) continue
    add(cashOutByMonth, ym, Math.max(0, Number(st.gst_net)) + Math.max(0, Number(st.qst_net)))
  }

  const shareCapital = Number(data.settings?.share_capital ?? 0)
  const openingRE = Number(data.settings?.opening_retained_earnings ?? 0)
  let cumulativeRE = openingRE

  return months.map((month) => {
    const invoicedRevenue = revenueByMonth.get(month) ?? 0
    const workedRevenue = workedByMonth.get(month) ?? 0
    const cashIn = cashInByMonth.get(month) ?? 0
    const cashOut = cashOutByMonth.get(month) ?? 0
    const payrollCost = payrollByMonth.get(month) ?? 0
    const operatingExpenses = opexByMonth.get(month) ?? 0
    const totalCosts = round2(payrollCost + operatingExpenses)
    const dividends = dividendsByMonth.get(month) ?? 0
    const operatingIncome = round2(invoicedRevenue - totalCosts)
    cumulativeRE = round2(cumulativeRE + operatingIncome - dividends)

    return {
      month,
      label: monthLabel(month),
      revenue: invoicedRevenue,
      invoicedRevenue,
      workedRevenue,
      payrollCost,
      operatingExpenses,
      operatingIncome,
      cashIn,
      cashOut,
      netCashFlow: round2(cashIn - cashOut),
      equity: round2(shareCapital + cumulativeRE),
    }
  })
}

export function hasChartData(points: MonthlySeriesPoint[]) {
  return points.some(
    (p) =>
      p.invoicedRevenue !== 0 ||
      p.workedRevenue !== 0 ||
      p.cashIn !== 0 ||
      p.cashOut !== 0 ||
      p.payrollCost !== 0 ||
      p.equity !== 0
  )
}