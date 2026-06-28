import { invoiceBalance } from './invoice'
import { isRevenueInvoice } from './taxes'

export interface CashFlowBreakdown {
  clientPayments: number
  expensesPaid: number
  payrollNetToEmployee: number
  employeeWithholdings: number
  employerPayrollContributions: number
  dividendsPaid: number
  corporateTaxPaid: number
  salesTaxRemitted: number
}

export interface BalanceSheetDetail {
  cash: number
  accountsReceivable: number
  gstReceivable: number
  qstReceivable: number
  totalAssets: number
  accountsPayable: number
  gstPayable: number
  qstPayable: number
  payrollRemittancesAccrued: number
  corporateTaxDue: number
  totalLiabilities: number
  equity: number
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

export function employeeIncomeTaxTotal(p: Pick<PayrollRunRow, 'federal_tax' | 'provincial_tax'>): number {
  return Number(p.federal_tax) + Number(p.provincial_tax)
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

/** Total employer cost for a pay run = gross salary + employer contributions. */
export function payrollEmployerTotal(p: Pick<
  PayrollRunRow,
  'gross_pay' | 'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits'
>): number {
  return Number(p.gross_pay) + employerContributionsTotal(p)
}

/** Amounts withheld from employee + employer statutory portions to remit. */
export function payrollRemittancesTotal(p: PayrollRunRow): number {
  return employeeDeductionsTotal(p) + employerContributionsTotal(p) - Number(p.employer_benefits)
}

export function buildFinancialSnapshot(data: {
  payments: { amount: number }[]
  expenses: { amount: number; total: number; paid: boolean; gst: number; qst: number; category?: string }[]
  payrollRuns: PayrollRunRow[]
  invoices: { id: string; total: number; status: string; subtotal: number; gst: number; qst: number }[]
  invoicePaidMap: Record<string, number>
  dividends?: { total_amount: number }[]
  corporateTax?: { amount: number; paid_amount: number; status: string }[]
  salesTaxRemitted?: { gst_net: number; qst_net: number }[]
}): FinancialSnapshot {
  const clientPayments = data.payments.reduce((s, p) => s + Number(p.amount), 0)

  const expensesPaid = data.expenses.filter((e) => e.paid).reduce((s, e) => s + Number(e.total), 0)
  const payrollNetToEmployee = data.payrollRuns.reduce((s, p) => s + Number(p.net_pay), 0)
  const employeeWithholdings = data.payrollRuns.reduce((s, p) => s + employeeDeductionsTotal(p), 0)
  const employerPayrollContributions = data.payrollRuns.reduce((s, p) => s + employerContributionsTotal(p), 0)
  const dividendsPaid = (data.dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0)
  const corporateTaxPaid = (data.corporateTax ?? []).reduce((s, r) => s + Number(r.paid_amount), 0)
  const salesTaxRemitted = (data.salesTaxRemitted ?? []).reduce(
    (s, t) => s + Math.max(0, Number(t.gst_net)) + Math.max(0, Number(t.qst_net)),
    0
  )

  const cashOut =
    expensesPaid +
    payrollNetToEmployee +
    employeeWithholdings +
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
    revenueYtd += Number(inv.subtotal)
    gstCollected += Number(inv.gst)
    qstCollected += Number(inv.qst)
    const paid = data.invoicePaidMap[inv.id] ?? 0
    accountsReceivable += invoiceBalance(Number(inv.total), paid)
  }

  const gstItc = data.expenses.reduce((s, e) => s + Number(e.gst), 0)
  const qstItr = data.expenses.reduce((s, e) => s + Number(e.qst), 0)

  const accountsPayable = data.expenses.filter((e) => !e.paid).reduce((s, e) => s + Number(e.total), 0)
  const gstPayable = round2(Math.max(0, gstCollected - gstItc))
  const qstPayable = round2(Math.max(0, qstCollected - qstItr))
  const gstReceivable = round2(Math.max(0, gstItc - gstCollected))
  const qstReceivable = round2(Math.max(0, qstItr - qstCollected))
  const salesTaxPayable = gstPayable + qstPayable

  const corporateTaxDue = (data.corporateTax ?? [])
    .filter((r) => r.status !== 'paid')
    .reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0)

  // P&L: pre-tax expenses only; recoverable taxes are balance-sheet items
  const expensesYtd = data.expenses.reduce((s, e) => s + Number(e.amount), 0)
  const payrollGross = data.payrollRuns.reduce((s, p) => s + Number(p.gross_pay), 0)
  const payrollYtd = payrollGross + employerPayrollContributions
  const operatingIncome = revenueYtd - expensesYtd - payrollYtd

  const cash = clientPayments - cashOut
  const totalAssets = cash + accountsReceivable + gstReceivable + qstReceivable
  const totalLiabilities = accountsPayable + gstPayable + qstPayable + corporateTaxDue
  const equity = totalAssets - totalLiabilities

  return {
    cashIn: clientPayments,
    cashOut,
    netCash: cash,
    accountsReceivable,
    accountsPayable,
    salesTaxPayable,
    revenueYtd,
    expensesYtd,
    payrollYtd,
    assets: { cash, accountsReceivable, total: totalAssets },
    liabilities: { accountsPayable, salesTaxPayable, total: totalLiabilities },
    equity,
    cashFlow: {
      clientPayments,
      expensesPaid,
      payrollNetToEmployee,
      employeeWithholdings,
      employerPayrollContributions,
      dividendsPaid,
      corporateTaxPaid,
      salesTaxRemitted,
    },
    balanceSheet: {
      cash,
      accountsReceivable,
      gstReceivable,
      qstReceivable,
      totalAssets,
      accountsPayable,
      gstPayable,
      qstPayable,
      payrollRemittancesAccrued: 0,
      corporateTaxDue,
      totalLiabilities,
      equity,
    },
    income: {
      revenueSubtotal: revenueYtd,
      operatingExpenses: expensesYtd,
      payrollGross,
      employerPayrollContributions,
      operatingIncome,
      dividendsDistributed: dividendsPaid,
    },
  }
}
