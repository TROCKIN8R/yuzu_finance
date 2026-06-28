import { invoiceBalance } from './invoice'

export interface CashFlowBreakdown {
  clientPayments: number
  expensesPaid: number
  payrollNetToEmployee: number
  employeeWithholdings: number
  employerPayrollContributions: number
  dividendsPaid: number
}

export interface BalanceSheetDetail {
  cash: number
  accountsReceivable: number
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
  dividendsDistributed: number
  netIncomeEstimate: number
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

/** Amounts withheld from employee + employer portions to remit to government. */
export function payrollRemittancesTotal(p: PayrollRunRow): number {
  return employeeDeductionsTotal(p) + employerContributionsTotal(p) - Number(p.employer_benefits)
}

export function buildFinancialSnapshot(data: {
  payments: { amount: number }[]
  expenses: { total: number; paid: boolean; category?: string }[]
  payrollRuns: PayrollRunRow[]
  invoices: { id: string; total: number; status: string; subtotal: number }[]
  invoicePaidMap: Record<string, number>
  salesTaxOpen: { gst_net: number; qst_net: number }[]
  dividends?: { total_amount: number }[]
  corporateTaxDue?: { amount: number; paid_amount: number; status: string }[]
}): FinancialSnapshot {
  const clientPayments = data.payments.reduce((s, p) => s + Number(p.amount), 0)

  const expensesPaid = data.expenses.filter((e) => e.paid).reduce((s, e) => s + Number(e.total), 0)
  const payrollNetToEmployee = data.payrollRuns.reduce((s, p) => s + Number(p.net_pay), 0)
  const employeeWithholdings = data.payrollRuns.reduce((s, p) => s + employeeDeductionsTotal(p), 0)
  const employerPayrollContributions = data.payrollRuns.reduce((s, p) => s + employerContributionsTotal(p), 0)
  const dividendsPaid = (data.dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0)

  const cashOut =
    expensesPaid + payrollNetToEmployee + employeeWithholdings + employerPayrollContributions + dividendsPaid

  let accountsReceivable = 0
  let revenueYtd = 0
  for (const inv of data.invoices) {
    if (inv.status === 'void') continue
    revenueYtd += Number(inv.subtotal)
    const paid = data.invoicePaidMap[inv.id] ?? 0
    accountsReceivable += invoiceBalance(Number(inv.total), paid)
  }

  const accountsPayable = data.expenses.filter((e) => !e.paid).reduce((s, e) => s + Number(e.total), 0)
  const gstPayable = data.salesTaxOpen.reduce((s, t) => s + Number(t.gst_net), 0)
  const qstPayable = data.salesTaxOpen.reduce((s, t) => s + Number(t.qst_net), 0)
  const salesTaxPayable = gstPayable + qstPayable

  const corporateTaxDue = (data.corporateTaxDue ?? [])
    .filter((r) => r.status !== 'paid')
    .reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0)

  const expensesYtd = data.expenses.reduce((s, e) => s + Number(e.total), 0)
  const payrollGross = data.payrollRuns.reduce((s, p) => s + Number(p.gross_pay), 0)
  const payrollYtd = payrollGross + employerPayrollContributions

  const cash = clientPayments - cashOut
  const totalAssets = cash + accountsReceivable
  const totalLiabilities = accountsPayable + gstPayable + qstPayable + corporateTaxDue
  const equity = totalAssets - totalLiabilities

  const netIncomeEstimate = revenueYtd - expensesYtd - payrollYtd - dividendsPaid

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
    },
    balanceSheet: {
      cash,
      accountsReceivable,
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
      dividendsDistributed: dividendsPaid,
      netIncomeEstimate,
    },
  }
}
