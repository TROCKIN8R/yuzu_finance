import { CHART_OF_ACCOUNTS, type AccountType } from './chartOfAccounts'
import type { JournalEntry } from './generalLedger'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

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

function normalBalanceDebit(accountType: AccountType): boolean {
  return accountType === 'asset' || accountType === 'expense'
}

export function accountBalancesFromEntries(entries: JournalEntry[]): Map<string, number> {
  const totals = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    for (const line of e.lines) {
      const cur = totals.get(line.accountCode) ?? { debit: 0, credit: 0 }
      cur.debit += line.debit
      cur.credit += line.credit
      totals.set(line.accountCode, cur)
    }
  }

  const balances = new Map<string, number>()
  for (const account of CHART_OF_ACCOUNTS) {
    const t = totals.get(account.code) ?? { debit: 0, credit: 0 }
    const raw = normalBalanceDebit(account.type) ? t.debit - t.credit : t.credit - t.debit
    balances.set(account.code, round2(raw))
  }
  return balances
}

export function balanceOf(balances: Map<string, number>, code: string): number {
  return balances.get(code) ?? 0
}

const OPERATING_EXPENSE_CODES = new Set(['5010', '5020', '5030', '5040', '5050', '5090', '5200'])

export interface PeriodIncomeDetail {
  revenueSubtotal: number
  operatingExpenses: number
  payrollGross: number
  employerPayrollContributions: number
  operatingIncome: number
  dividendsDeclared: number
}

export function incomeFromPeriodEntries(entries: JournalEntry[]): PeriodIncomeDetail {
  let revenueSubtotal = 0
  let operatingExpenses = 0
  let payrollGross = 0
  let employerPayrollContributions = 0
  let dividendsDeclared = 0

  for (const e of entries) {
    for (const line of e.lines) {
      const code = line.accountCode
      if (code === '4000') revenueSubtotal += line.credit - line.debit
      if (OPERATING_EXPENSE_CODES.has(code)) operatingExpenses += line.debit - line.credit
      if (code === '5100') payrollGross += line.debit - line.credit
      if (code === '5110') employerPayrollContributions += line.debit - line.credit
    }
    if (e.sourceType === 'dividend_declared') {
      dividendsDeclared += e.lines.find((l) => l.accountCode === '3100')?.debit ?? 0
    }
  }

  const operatingIncome = round2(revenueSubtotal - operatingExpenses - payrollGross - employerPayrollContributions)
  return {
    revenueSubtotal: round2(revenueSubtotal),
    operatingExpenses: round2(operatingExpenses),
    payrollGross: round2(payrollGross),
    employerPayrollContributions: round2(employerPayrollContributions),
    operatingIncome,
    dividendsDeclared: round2(dividendsDeclared),
  }
}

function cashMovement(entry: JournalEntry): { inflow: number; outflow: number } {
  let inflow = 0
  let outflow = 0
  for (const line of entry.lines) {
    if (line.accountCode !== '1010') continue
    inflow += line.debit
    outflow += line.credit
  }
  return { inflow: round2(inflow), outflow: round2(outflow) }
}

export function cashFlowFromPeriodEntries(entries: JournalEntry[]): CashFlowBreakdown {
  let clientPayments = 0
  let expensesPaid = 0
  let payrollNetToEmployee = 0
  let payrollRemittancesPaid = 0
  let dividendsPaid = 0
  let corporateTaxPaid = 0
  let salesTaxRemitted = 0
  let employeeWithholdings = 0
  let employerPayrollContributions = 0

  for (const e of entries) {
    const { inflow, outflow } = cashMovement(e)
    switch (e.sourceType) {
      case 'payment':
        clientPayments += inflow
        break
      case 'expense':
        expensesPaid += outflow
        break
      case 'payroll':
        payrollNetToEmployee += outflow
        break
      case 'payroll_remittance':
        payrollRemittancesPaid += outflow
        break
      case 'dividend':
        dividendsPaid += outflow
        break
      case 'corporate_tax':
        corporateTaxPaid += outflow
        break
      case 'sales_tax':
        salesTaxRemitted += outflow - inflow
        break
      case 'adjustment':
        if (outflow > inflow) expensesPaid += round2(outflow - inflow)
        else clientPayments += round2(inflow - outflow)
        break
      default:
        break
    }

    if (e.sourceType === 'payroll') {
      employeeWithholdings += round2(
        (e.lines.find((l) => l.accountCode === '2200')?.credit ?? 0) +
          (e.lines.find((l) => l.accountCode === '2210')?.credit ?? 0) -
          (e.lines.find((l) => l.accountCode === '2210')?.debit ?? 0)
      )
      employerPayrollContributions += e.lines.find((l) => l.accountCode === '5110')?.debit ?? 0
    }
  }

  return {
    clientPayments: round2(clientPayments),
    expensesPaid: round2(expensesPaid),
    payrollNetToEmployee: round2(payrollNetToEmployee),
    employeeWithholdings: round2(employeeWithholdings),
    employerPayrollContributions: round2(employerPayrollContributions),
    payrollRemittancesPaid: round2(payrollRemittancesPaid),
    dividendsPaid: round2(dividendsPaid),
    corporateTaxPaid: round2(corporateTaxPaid),
    salesTaxRemitted: round2(salesTaxRemitted),
  }
}

export function cashOutTotal(cf: CashFlowBreakdown): number {
  return round2(
    cf.expensesPaid +
      cf.payrollNetToEmployee +
      cf.payrollRemittancesPaid +
      cf.dividendsPaid +
      cf.corporateTaxPaid +
      cf.salesTaxRemitted
  )
}

export function entriesThroughDate(entries: JournalEntry[], asOf: string): JournalEntry[] {
  if (!asOf) return entries
  return entries.filter((e) => e.date <= asOf)
}
