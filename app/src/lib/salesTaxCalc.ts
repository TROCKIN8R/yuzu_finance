import { isRevenueInvoice } from './taxes'

export interface SalesTaxTotals {
  gst_collected: number
  qst_collected: number
  gst_itc: number
  qst_itr: number
  gst_net: number
  qst_net: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function inRange(date: string, periodStart: string, periodEnd: string) {
  return date >= periodStart && date <= periodEnd
}

/** Mirrors GL expense recognition — excludes payroll-category and payroll-linked rows. */
function isGlOperatingExpense(e: { category?: string; payroll_run_id?: string | null }) {
  return e.category !== 'payroll' && !e.payroll_run_id
}

/** Employee expenses with ITC in GL (non-taxable accruals at expense date). */
function isGlEmployeeExpense(e: { taxable?: boolean }) {
  return !e.taxable
}

export function calculateSalesTaxPeriod(
  periodStart: string,
  periodEnd: string,
  invoices: { gst: number; qst: number; invoice_date: string; status: string }[],
  expenses: { gst: number; qst: number; expense_date: string; category?: string; payroll_run_id?: string | null }[],
  employeeExpenses: {
    gst: number
    qst: number
    expense_date: string
    taxable?: boolean
    payroll_run_id?: string | null
  }[] = []
): SalesTaxTotals {
  const gst_collected = invoices
    .filter((i) => isRevenueInvoice(i.status) && inRange(i.invoice_date, periodStart, periodEnd))
    .reduce((s, i) => s + Number(i.gst), 0)
  const qst_collected = invoices
    .filter((i) => isRevenueInvoice(i.status) && inRange(i.invoice_date, periodStart, periodEnd))
    .reduce((s, i) => s + Number(i.qst), 0)
  const gst_itc =
    expenses
      .filter((e) => isGlOperatingExpense(e) && inRange(e.expense_date, periodStart, periodEnd))
      .reduce((s, e) => s + Number(e.gst), 0) +
    employeeExpenses
      .filter((e) => isGlEmployeeExpense(e) && inRange(e.expense_date, periodStart, periodEnd))
      .reduce((s, e) => s + Number(e.gst), 0)
  const qst_itr =
    expenses
      .filter((e) => isGlOperatingExpense(e) && inRange(e.expense_date, periodStart, periodEnd))
      .reduce((s, e) => s + Number(e.qst), 0) +
    employeeExpenses
      .filter((e) => isGlEmployeeExpense(e) && inRange(e.expense_date, periodStart, periodEnd))
      .reduce((s, e) => s + Number(e.qst), 0)
  return {
    gst_collected: round2(gst_collected),
    qst_collected: round2(qst_collected),
    gst_itc: round2(gst_itc),
    qst_itr: round2(qst_itr),
    gst_net: round2(gst_collected - gst_itc),
    qst_net: round2(qst_collected - qst_itr),
  }
}
