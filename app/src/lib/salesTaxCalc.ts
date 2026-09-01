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

/** Employee expenses with ITC in GL (non-taxable at expense date; taxable GST/QST when reimbursed). */
function isGlEmployeeExpense(e: { taxable?: boolean; payroll_run_id?: string | null }) {
  if (!e.taxable) return true
  return !!e.payroll_run_id
}

export function invoicePaidThroughDate(
  invoice: { id: string; total: number; status: string },
  payments: { invoice_id: string; payment_date?: string | null; amount: number }[],
  asOf: string
): boolean {
  if (!isRevenueInvoice(invoice.status)) return false
  const paid = payments
    .filter((p) => p.invoice_id === invoice.id && p.payment_date && p.payment_date <= asOf)
    .reduce((s, p) => s + Number(p.amount), 0)
  return paid + 0.005 >= Number(invoice.total)
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

/** Net TPS/TVQ still to remit, counting collected tax only on invoices fully paid through asOf. Draft for CPA review. */
export function outstandingSalesTaxOnPaidInvoices(params: {
  asOf: string
  invoices: { id: string; gst: number; qst: number; total: number; status: string; invoice_date: string }[]
  payments: { invoice_id: string; payment_date?: string | null; amount: number }[]
  expenses: { gst: number; qst: number; expense_date: string; category?: string; payroll_run_id?: string | null }[]
  employeeExpenses?: {
    gst: number
    qst: number
    expense_date: string
    taxable?: boolean
    payroll_run_id?: string | null
  }[]
  remittances: { gst_net: number; qst_net: number; status?: string; filed_date?: string | null; period_end: string }[]
}): number {
  const { asOf, invoices, payments, expenses, employeeExpenses = [], remittances } = params
  const paidInvoices = invoices.filter((inv) => invoicePaidThroughDate(inv, payments, asOf))
  const totals = calculateSalesTaxPeriod('0001-01-01', asOf, paidInvoices, expenses, employeeExpenses)
  const remitted = remittances
    .filter((r) => (r.status ?? 'paid') === 'paid' && (r.filed_date || r.period_end) <= asOf)
    .reduce((s, r) => s + Number(r.gst_net) + Number(r.qst_net), 0)
  return Math.max(0, round2(totals.gst_net + totals.qst_net - remitted))
}
