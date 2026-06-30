import { buildGeneralLedger, filterEntriesByPeriod, type JournalEntry } from './generalLedger'
import {
  accountBalancesFromEntries,
  balanceOf,
  cashFlowFromPeriodEntries,
  cashOutTotal,
  entriesThroughDate,
  incomeFromPeriodEntries,
  type CashFlowBreakdown,
} from './ledgerBalances'
import { inPeriod, type DateRange } from './fiscalPeriod'
import { isRevenueInvoice } from './taxes'
import type { AccountingAdjustment, OrganizationSettings } from './types'

export type { CashFlowBreakdown } from './ledgerBalances'

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
  /** Bank import total minus GL cash (1010); should be near zero when fully reconciled. */
  bankReconciliationVariance: number | null
  accountsReceivable: number
  gstReceivable: number
  qstReceivable: number
  unbilledRevenue: number
  totalAssets: number
  accountsPayable: number
  gstPayable: number
  qstPayable: number
  payrollRemittancesPending: number
  chargesPayable: number
  employerLeviesPending: number
  employeeReimbursementsPending: number
  dividendsPayable: number
  corporateTaxDue: number
  corpTaxProvision: number
  totalLiabilities: number
  equity: EquityDetail
}

export interface IncomeDetail {
  /** GL account 4000 (+ WIP accrual) for the period */
  revenueSubtotal: number
  /** Invoice subtotals (HT) by invoice date — operational billing */
  invoicedSubtotal: number
  operatingExpenses: number
  payrollGross: number
  employerPayrollContributions: number
  operatingIncome: number
  dividendsDistributed: number
}

/** Lifetime billing vs collections through period end (subledger). */
export interface BillingDetail {
  invoicedTtcCumulative: number
  collectedTtcCumulative: number
  collectionRatePct: number | null
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
  billing: BillingDetail
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
  hsf_employer?: number
  cnesst_employer?: number
  net_pay: number
}

export type GeneralLedgerBuildInput = Parameters<typeof buildGeneralLedger>[0]

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
  'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits' | 'hsf_employer' | 'cnesst_employer'
>): number {
  return (
    Number(p.cpp_employer) +
    Number(p.ei_employer) +
    Number(p.qpip_employer) +
    Number(p.employer_benefits) +
    Number(p.hsf_employer ?? 0) +
    Number(p.cnesst_employer ?? 0)
  )
}

export function payrollEmployerTotal(p: Pick<
  PayrollRunRow,
  'gross_pay' | 'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits'
>): number {
  return Number(p.gross_pay) + employerContributionsTotal(p)
}

export { payrollRemittancesTotal } from './payrollRemittance'

function buildLedgerEntries(data: GeneralLedgerBuildInput, period: DateRange): JournalEntry[] {
  return buildGeneralLedger({
    ...data,
    periodEnd: period.end || undefined,
    periodStart: period.start || undefined,
  })
}

function buildBillingCollection(
  invoices: { id: string; invoice_date: string; status: string; total: number }[],
  payments: { invoice_id: string; payment_date?: string | null; amount: number }[],
  asOf: string
): BillingDetail {
  const revenueInvoices = invoices.filter(
    (i) => isRevenueInvoice(i.status) && i.invoice_date <= asOf
  )
  const invoicedTtcCumulative = round2(revenueInvoices.reduce((s, i) => s + Number(i.total), 0))
  const invoiceIds = new Set(revenueInvoices.map((i) => i.id))
  const collectedTtcCumulative = round2(
    payments
      .filter(
        (p) =>
          invoiceIds.has(p.invoice_id) &&
          p.payment_date &&
          p.payment_date <= asOf
      )
      .reduce((s, p) => s + Number(p.amount), 0)
  )
  return {
    invoicedTtcCumulative,
    collectedTtcCumulative,
    collectionRatePct:
      invoicedTtcCumulative > 0
        ? round2((collectedTtcCumulative / invoicedTtcCumulative) * 100)
        : null,
  }
}

export function buildFinancialSnapshot(
  data: GeneralLedgerBuildInput & {
    payrollRuns: PayrollRunRow[]
    bankTransactions?: { amount: number; transaction_date: string }[]
    payments?: { id: string; invoice_id: string; payment_date?: string | null; amount: number }[]
    settings?: Pick<
      OrganizationSettings,
      | 'share_capital'
      | 'opening_retained_earnings'
      | 'opening_cash_balance'
      | 'opening_balance_date'
      | 'estimated_corp_tax_rate'
      | 'wip_accrual_enabled'
    > | null
  },
  period: DateRange
): FinancialSnapshot {
  const allEntries = buildLedgerEntries(data, period)
  const asOf = period.end || '9999-12-31'
  const asOfEntries = entriesThroughDate(allEntries, asOf)
  const periodEntries = filterEntriesByPeriod(allEntries, period.start, period.end)
  const balances = accountBalancesFromEntries(asOfEntries)
  const income = incomeFromPeriodEntries(periodEntries)
  const cashFlow = cashFlowFromPeriodEntries(periodEntries)

  const payrollInPeriod = data.payrollRuns.filter((p) => inPeriod(p.payment_date, period))
  const supplementalWithholdings = payrollInPeriod.reduce((s, p) => s + employeeDeductionsTotal(p), 0)
  const supplementalEmployer = payrollInPeriod.reduce((s, p) => s + employerContributionsTotal(p), 0)

  const cash = balanceOf(balances, '1010')
  const accountsReceivable = balanceOf(balances, '1100')
  const gstReceivable = balanceOf(balances, '1200')
  const qstReceivable = balanceOf(balances, '1210')
  const unbilledRevenue = balanceOf(balances, '1300')
  const accountsPayable = balanceOf(balances, '2000')
  const gstPayable = balanceOf(balances, '2100')
  const qstPayable = balanceOf(balances, '2110')
  const payrollRemittancesPending = round2(balanceOf(balances, '2200') + balanceOf(balances, '2210'))
  const chargesPayable = balanceOf(balances, '2050')
  const employerLeviesPending = balanceOf(balances, '2215')
  const employeeReimbursementsPending = balanceOf(balances, '2060')
  const dividendsPayable = balanceOf(balances, '2125')
  const corporateTaxDue = balanceOf(balances, '2300')
  const corpTaxProvision = balanceOf(balances, '2310')
  const shareCapital = balanceOf(balances, '3000') || Number(data.settings?.share_capital ?? 0)
  const retainedEarnings = balanceOf(balances, '3100')
  const totalEquity = round2(shareCapital + retainedEarnings)
  const salesTaxPayable = round2(gstPayable + qstPayable)
  const totalAssets = round2(cash + accountsReceivable + gstReceivable + qstReceivable + unbilledRevenue)
  const totalLiabilities = round2(
    accountsPayable +
      gstPayable +
      qstPayable +
      payrollRemittancesPending +
      chargesPayable +
      employerLeviesPending +
      employeeReimbursementsPending +
      dividendsPayable +
      corporateTaxDue +
      corpTaxProvision
  )

  const cashIn = cashFlow.clientPayments
  const cashOut = cashOutTotal(cashFlow)

  const bankStatementBalance =
    data.bankTransactions && data.bankTransactions.length > 0
      ? round2(data.bankTransactions.reduce((s, t) => s + Number(t.amount), 0))
      : null

  const bankReconciliationVariance =
    bankStatementBalance != null ? round2(bankStatementBalance - cash) : null

  const invoicedSubtotal = round2(
    data.invoices
      .filter((i) => isRevenueInvoice(i.status) && inPeriod(i.invoice_date, period))
      .reduce((s, i) => s + Number(i.subtotal), 0)
  )

  const openingRE = Number(data.settings?.opening_retained_earnings ?? 0)
  const billing = buildBillingCollection(data.invoices ?? [], data.payments ?? [], asOf)

  return {
    period,
    cashIn,
    cashOut,
    netCash: cash,
    accountsReceivable,
    accountsPayable,
    salesTaxPayable,
    revenueYtd: income.revenueSubtotal,
    expensesYtd: income.operatingExpenses,
    payrollYtd: round2(income.payrollGross + income.employerPayrollContributions),
    assets: { cash, accountsReceivable, total: totalAssets },
    liabilities: { accountsPayable, salesTaxPayable, total: totalLiabilities },
    equity: totalEquity,
    cashFlow: {
      ...cashFlow,
      employeeWithholdings: supplementalWithholdings,
      employerPayrollContributions: supplementalEmployer,
    },
    balanceSheet: {
      cash,
      bankStatementBalance,
      bankReconciliationVariance,
      accountsReceivable,
      gstReceivable,
      qstReceivable,
      unbilledRevenue,
      totalAssets,
      accountsPayable,
      gstPayable,
      qstPayable,
      payrollRemittancesPending,
      chargesPayable,
      employerLeviesPending,
      employeeReimbursementsPending,
      dividendsPayable,
      corporateTaxDue,
      corpTaxProvision,
      totalLiabilities,
      equity: {
        shareCapital,
        openingRetainedEarnings: openingRE,
        operatingIncome: income.operatingIncome,
        dividendsDistributed: income.dividendsDeclared,
        retainedEarnings,
        totalEquity,
      },
    },
    income: {
      revenueSubtotal: income.revenueSubtotal,
      invoicedSubtotal,
      operatingExpenses: income.operatingExpenses,
      payrollGross: income.payrollGross,
      employerPayrollContributions: income.employerPayrollContributions,
      operatingIncome: income.operatingIncome,
      dividendsDistributed: income.dividendsDeclared,
    },
    billing,
  }
}

export type { AccountingAdjustment }
