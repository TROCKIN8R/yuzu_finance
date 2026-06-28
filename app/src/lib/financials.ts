import { invoiceBalance } from './invoice'

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
}

export function buildFinancialSnapshot(data: {
  payments: { amount: number }[]
  expenses: { total: number; paid: boolean }[]
  payrollRuns: { gross_pay: number; cpp_employer: number; ei_employer: number; qpip_employer: number; employer_benefits: number; net_pay: number }[]
  invoices: { id: string; total: number; status: string; subtotal: number }[]
  invoicePaidMap: Record<string, number>
  salesTaxOpen: { gst_net: number; qst_net: number }[]
}): FinancialSnapshot {
  const cashIn = data.payments.reduce((s, p) => s + Number(p.amount), 0)

  const expenseOut = data.expenses.filter((e) => e.paid).reduce((s, e) => s + Number(e.total), 0)
  const payrollOut = data.payrollRuns.reduce((s, p) => s + Number(p.net_pay), 0)
  const employerPayroll = data.payrollRuns.reduce(
    (s, p) => s + Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer) + Number(p.employer_benefits),
    0
  )
  const cashOut = expenseOut + payrollOut + employerPayroll

  let accountsReceivable = 0
  let revenueYtd = 0
  for (const inv of data.invoices) {
    if (inv.status === 'void') continue
    revenueYtd += Number(inv.subtotal)
    const paid = data.invoicePaidMap[inv.id] ?? 0
    accountsReceivable += invoiceBalance(Number(inv.total), paid)
  }

  const accountsPayable = data.expenses.filter((e) => !e.paid).reduce((s, e) => s + Number(e.total), 0)
  const salesTaxPayable = data.salesTaxOpen.reduce((s, t) => s + Number(t.gst_net) + Number(t.qst_net), 0)

  const expensesYtd = data.expenses.reduce((s, e) => s + Number(e.total), 0)
  const payrollYtd = data.payrollRuns.reduce(
    (s, p) => s + Number(p.gross_pay) + Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer) + Number(p.employer_benefits),
    0
  )

  const cash = cashIn - cashOut
  const assets = { cash, accountsReceivable, total: cash + accountsReceivable }
  const liabilities = { accountsPayable, salesTaxPayable, total: accountsPayable + salesTaxPayable }
  const equity = assets.total - liabilities.total

  return {
    cashIn,
    cashOut,
    netCash: cash,
    accountsReceivable,
    accountsPayable,
    salesTaxPayable,
    revenueYtd,
    expensesYtd,
    payrollYtd,
    assets,
    liabilities,
    equity,
  }
}

export function payrollEmployerTotal(p: {
  gross_pay: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  employer_benefits: number
}): number {
  return (
    Number(p.gross_pay) +
    Number(p.cpp_employer) +
    Number(p.ei_employer) +
    Number(p.qpip_employer) +
    Number(p.employer_benefits)
  )
}
