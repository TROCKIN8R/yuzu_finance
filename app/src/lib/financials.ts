import { invoiceBalance } from './invoice'
import { inPeriod, type DateRange } from './fiscalPeriod'
import { isRevenueInvoice } from './taxes'

export interface CashFlowBreakdown {
  clientPayments: number
  expensesPaid: number
  payrollNetToEmployee: number
  employeeWithholdings: number
  employerPayrollContributions: number
  payrollRemittancesPaid: number
  dividendsPaid: number
  corporateTaxPaid: number
  salesTaxRemitted: number
}

export interface EquityDetail {
  shareCapital: number
  openingRetainedEarnings: number
  operatingIncome: number
  dividendsDistributed: number
  retainedEarnings: number
  totalEquity: number
}

export interface BalanceSheetDetail {
  cash: number
  bankStatementBalance: number | null
  accountsReceivable: number
  gstReceivable: number
  qstReceivable: number
  totalAssets: number
  accountsPayable: number
  gstPayable: number
  qstPayable: number
  payrollRemittancesPending: number
  employeeReimbursementsPending: number
  dividendsPayable: number
  corporateTaxDue: number
  corpTaxProvision: number
  totalLiabilities: number
  equity: EquityDetail
}

export interface IncomeDetail {
  revenueSubtotal: number
  operatingExpenses: number
  payrollGross: number
  employerPayrollContributions: number
  operatingIncome: number
  dividendsDistributed: number
}

export interface FinancialSnapshot {
  period: DateRange
  cashIn: number
  cashOut: number
  netCash: number
  accountsReceivable: number
  accountsPayable: number
  salesTaxPayable: number
  revenueYtd: number
  expensesYtd: number
  payrollYtd: number
  assets: { cash: number; accountsReceivable: number; total: number }
  liabilities: { accountsPayable: number; salesTaxPayable: number; total: number }
  equity: number
  cashFlow: CashFlowBreakdown
  balanceSheet: BalanceSheetDetail
  income: IncomeDetail
}

type PayrollRunRow = {
  payment_date: string
  remittance_status?: string
  remittance_date?: string | null
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  other_deductions: number
  employer_benefits: number
  net_pay: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function employeeDeductionsTotal(p: Pick<
  PayrollRunRow,
  'federal_tax' | 'provincial_tax' | 'cpp_employee' | 'ei_employee' | 'qpip_employee' | 'other_deductions'
>): number {
  return (
    Number(p.federal_tax) +
    Number(p.provincial_tax) +
    Number(p.cpp_employee) +
    Number(p.ei_employee) +
    Number(p.qpip_employee) +
    Number(p.other_deductions)
  )
}

export function employerContributionsTotal(p: Pick<
  PayrollRunRow,
  'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits'
>): number {
  return (
    Number(p.cpp_employer) +
    Number(p.ei_employer) +
    Number(p.qpip_employer) +
    Number(p.employer_benefits)
  )
}

export function payrollEmployerTotal(p: Pick<
  PayrollRunRow,
  'gross_pay' | 'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits'
>): number {
  return Number(p.gross_pay) + employerContributionsTotal(p)
}

export function payrollRemittancesTotal(p: PayrollRunRow): number {
  return employeeDeductionsTotal(p) + employerContributionsTotal(p) - Number(p.employer_benefits)
}

function isOperatingExpense(
  e: { category?: string; payroll_run_id?: string | null; expense_date: string },
  period: DateRange
) {
  if (!inPeriod(e.expense_date, period)) return false
  if (e.category === 'payroll' || e.payroll_run_id) return false
  return true
}

export function buildFinancialSnapshot(
  data: {
    payments: { amount: number; payment_date?: string }[]
    expenses: {
      amount: number
      total: number
      paid: boolean
      gst: number
      qst: number
      category?: string
      payroll_run_id?: string | null
      expense_date: string
    }[]
    employeeExpenses?: {
      amount: number
      total: number
      gst: number
      qst: number
      category?: string
      taxable: boolean
      payroll_run_id?: string | null
      expense_date: string
    }[]
    payrollRuns: PayrollRunRow[]
    invoices: {
      id: string
      total: number
      status: string
      subtotal: number
      gst: number
      qst: number
      invoice_date: string
    }[]
    invoicePaidMap: Record<string, number>
    dividends?: {
      total_amount: number
      declared_date: string
      payment_date: string | null
      status: string
    }[]
    corporateTax?: { amount: number; paid_amount: number; status: string }[]
    salesTaxRemitted?: { gst_net: number; qst_net: number; filed_date?: string | null; period_end: string }[]
    bankTransactions?: { amount: number; transaction_date: string }[]
    settings?: {
      share_capital?: number
      opening_retained_earnings?: number
      opening_cash_balance?: number
      estimated_corp_tax_rate?: number
    }
  },
  period: DateRange
): FinancialSnapshot {
  const paymentsInPeriod = data.payments.filter((p) => inPeriod(p.payment_date ?? '', period))
  const clientPayments = paymentsInPeriod.reduce((s, p) => s + Number(p.amount), 0)

  const expensesInPeriod = data.expenses.filter((e) => inPeriod(e.expense_date, period))
  const expensesPaid = expensesInPeriod.filter((e) => e.paid).reduce((s, e) => s + Number(e.total), 0)

  const payrollInPeriod = data.payrollRuns.filter((p) => inPeriod(p.payment_date, period))
  const payrollNetToEmployee = payrollInPeriod.reduce((s, p) => s + Number(p.net_pay), 0)
  const employeeWithholdings = payrollInPeriod.reduce((s, p) => s + employeeDeductionsTotal(p), 0)
  const employerPayrollContributions = payrollInPeriod.reduce((s, p) => s + employerContributionsTotal(p), 0)

  const payrollRemittancesPaid = payrollInPeriod
    .filter((p) => p.remittance_status === 'remitted' && p.remittance_date && inPeriod(p.remittance_date, period))
    .reduce((s, p) => s + payrollRemittancesTotal(p), 0)

  const payrollRemittancesPending = data.payrollRuns
    .filter((p) => p.remittance_status !== 'remitted')
    .reduce((s, p) => s + payrollRemittancesTotal(p), 0)

  const dividendsDeclared = (data.dividends ?? [])
    .filter((d) => inPeriod(d.declared_date, period))
    .reduce((s, d) => s + Number(d.total_amount), 0)

  const dividendsPaid = (data.dividends ?? [])
    .filter((d) => d.status === 'paid' && d.payment_date && inPeriod(d.payment_date, period))
    .reduce((s, d) => s + Number(d.total_amount), 0)

  const dividendsPayable = (data.dividends ?? [])
    .filter((d) => d.status === 'declared')
    .reduce((s, d) => s + Number(d.total_amount), 0)

  const corporateTaxPaid = (data.corporateTax ?? []).reduce((s, r) => s + Number(r.paid_amount), 0)

  const salesTaxRemitted = (data.salesTaxRemitted ?? [])
    .filter((t) => inPeriod(t.filed_date ?? t.period_end, period))
    .reduce((s, t) => s + Math.max(0, Number(t.gst_net)) + Math.max(0, Number(t.qst_net)), 0)

  const cashOut =
    expensesPaid +
    payrollNetToEmployee +
    payrollRemittancesPaid +
    employerPayrollContributions +
    dividendsPaid +
    corporateTaxPaid +
    salesTaxRemitted

  let accountsReceivable = 0
  let revenueYtd = 0
  let gstCollected = 0
  let qstCollected = 0
  for (const inv of data.invoices) {
    if (inv.status === 'void' || !isRevenueInvoice(inv.status)) continue
    if (!inPeriod(inv.invoice_date, period)) continue
    revenueYtd += Number(inv.subtotal)
    gstCollected += Number(inv.gst)
    qstCollected += Number(inv.qst)
    const paid = data.invoicePaidMap[inv.id] ?? 0
    accountsReceivable += invoiceBalance(Number(inv.total), paid)
  }

  const operatingExpensesList = data.expenses.filter((e) => isOperatingExpense(e, period))
  const employeeExpensesInPeriod = (data.employeeExpenses ?? []).filter(
    (e) => inPeriod(e.expense_date, period) && !e.payroll_run_id && !e.taxable
  )
  const gstItc =
    operatingExpensesList.reduce((s, e) => s + Number(e.gst), 0) +
    employeeExpensesInPeriod.reduce((s, e) => s + Number(e.gst), 0)
  const qstItr =
    operatingExpensesList.reduce((s, e) => s + Number(e.qst), 0) +
    employeeExpensesInPeriod.reduce((s, e) => s + Number(e.qst), 0)

  const accountsPayable = expensesInPeriod.filter((e) => !e.paid).reduce((s, e) => s + Number(e.total), 0)
  const gstPayable = round2(Math.max(0, gstCollected - gstItc))
  const qstPayable = round2(Math.max(0, qstCollected - qstItr))
  const gstReceivable = round2(Math.max(0, gstItc - gstCollected))
  const qstReceivable = round2(Math.max(0, qstItr - qstCollected))
  const salesTaxPayable = gstPayable + qstPayable

  const corporateTaxDue = (data.corporateTax ?? [])
    .filter((r) => r.status !== 'paid')
    .reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0)

  const expensesYtd =
    operatingExpensesList.reduce((s, e) => s + Number(e.amount), 0) +
    employeeExpensesInPeriod.reduce((s, e) => s + Number(e.amount), 0)

  const employeeReimbursementsPending = (data.employeeExpenses ?? [])
    .filter((e) => !e.payroll_run_id && !e.taxable)
    .reduce((s, e) => s + Number(e.total), 0)
  const payrollGross = payrollInPeriod.reduce((s, p) => s + Number(p.gross_pay), 0)
  const payrollYtd = payrollGross + employerPayrollContributions
  const operatingIncome = revenueYtd - expensesYtd - payrollYtd

  const corpTaxRate = Number(data.settings?.estimated_corp_tax_rate ?? 0)
  const corpTaxProvision = round2(Math.max(0, operatingIncome * corpTaxRate))

  const shareCapital = Number(data.settings?.share_capital ?? 0)
  const openingRE = Number(data.settings?.opening_retained_earnings ?? 0)
  const retainedEarnings = round2(openingRE + operatingIncome - dividendsDeclared)
  const totalEquity = round2(shareCapital + retainedEarnings)

  const openingCash = Number(data.settings?.opening_cash_balance ?? 0)
  const bookCash = round2(openingCash + clientPayments - cashOut)

  const bankStatementBalance =
    data.bankTransactions && data.bankTransactions.length > 0
      ? round2(data.bankTransactions.reduce((s, t) => s + Number(t.amount), 0))
      : null

  const totalAssets = bookCash + accountsReceivable + gstReceivable + qstReceivable
  const totalLiabilities =
    accountsPayable +
    gstPayable +
    qstPayable +
    payrollRemittancesPending +
    employeeReimbursementsPending +
    dividendsPayable +
    corporateTaxDue +
    corpTaxProvision

  return {
    period,
    cashIn: clientPayments,
    cashOut,
    netCash: bookCash,
    accountsReceivable,
    accountsPayable,
    salesTaxPayable,
    revenueYtd,
    expensesYtd,
    payrollYtd,
    assets: { cash: bookCash, accountsReceivable, total: totalAssets },
    liabilities: { accountsPayable, salesTaxPayable, total: totalLiabilities },
    equity: totalEquity,
    cashFlow: {
      clientPayments,
      expensesPaid,
      payrollNetToEmployee,
      employeeWithholdings,
      employerPayrollContributions,
      payrollRemittancesPaid,
      dividendsPaid,
      corporateTaxPaid,
      salesTaxRemitted,
    },
    balanceSheet: {
      cash: bookCash,
      bankStatementBalance,
      accountsReceivable,
      gstReceivable,
      qstReceivable,
      totalAssets,
      accountsPayable,
      gstPayable,
      qstPayable,
      payrollRemittancesPending,
      employeeReimbursementsPending,
      dividendsPayable,
      corporateTaxDue,
      corpTaxProvision,
      totalLiabilities,
      equity: {
        shareCapital,
        openingRetainedEarnings: openingRE,
        operatingIncome,
        dividendsDistributed: dividendsDeclared,
        retainedEarnings,
        totalEquity,
      },
    },
    income: {
      revenueSubtotal: revenueYtd,
      operatingExpenses: expensesYtd,
      payrollGross,
      employerPayrollContributions,
      operatingIncome,
      dividendsDistributed: dividendsDeclared,
    },
  }
}
