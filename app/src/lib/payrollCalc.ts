import type { PayFrequency } from './types'
import { addDays } from './format'
import { round2 } from './taxes'

/**
 * Québec payroll estimates — 2026 rates (CRA T4032-QC / Retraite Québec / RQAP).
 * Planning only — not a payroll provider. Draft for owner/CPA review.
 */
export const PAYROLL_RATES_YEAR = 2026

const YMPE = 74_600
const YAMPE = 85_000
const QPP_BASIC_EXEMPTION = 3_500
/** Base plan 5.3% + first additional plan 1%. */
const QPP_COMBINED_RATE = 0.063
const QPP_BASE_RATE = 0.053
const QPP2_RATE = 0.04

/** Québec reduced EI (parental benefits paid via RQAP). */
const EI_MAX_INSURABLE = 68_900
const EI_EMPLOYEE_RATE = 0.013
const EI_EMPLOYER_MULTIPLIER = 1.4

const QPIP_MAX_INSURABLE = 103_000
const QPIP_EMPLOYEE_RATE = 0.0043
const QPIP_EMPLOYER_RATE = 0.00602

const FEDERAL_BPA_MAX = 16_452
const FEDERAL_BPA_MIN = 14_829
const FEDERAL_BPA_PHASE_START = 181_440
const FEDERAL_BPA_PHASE_END = 258_482
const CANADA_EMPLOYMENT_AMOUNT = 1_501
const FEDERAL_LOWEST_RATE = 0.14
const QUEBEC_FEDERAL_ABATEMENT = 0.165

const QUEBEC_BPA = 18_952
const QUEBEC_LOWEST_RATE = 0.14
const QUEBEC_WORKER_DEDUCTION_RATE = 0.06
const QUEBEC_WORKER_DEDUCTION_MAX = 1_450

const FEDERAL_BRACKETS: [number, number][] = [
  [58_523, 0.14],
  [117_045, 0.205],
  [181_440, 0.26],
  [258_482, 0.29],
  [Infinity, 0.33],
]

const QUEBEC_BRACKETS: [number, number][] = [
  [54_345, 0.14],
  [108_680, 0.19],
  [132_245, 0.24],
  [Infinity, 0.2575],
]

export function periodsPerYear(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly':
      return 52
    case 'biweekly':
      return 26
    case 'semimonthly':
      return 24
    case 'monthly':
      return 12
  }
}

export function payFrequencyLabel(freq: PayFrequency): string {
  switch (freq) {
    case 'weekly':
      return 'Hebdomadaire'
    case 'biweekly':
      return 'Aux 2 semaines'
    case 'semimonthly':
      return 'Bi-mensuel'
    case 'monthly':
      return 'Mensuel'
  }
}

export function grossPerPeriod(yearlySalary: number, freq: PayFrequency): number {
  return round2(yearlySalary / periodsPerYear(freq))
}

export function payPeriodRange(paymentDate: string, freq: PayFrequency): { start: string; end: string } {
  const spanDays = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }[freq]
  return { end: paymentDate, start: addDays(paymentDate, -(spanDays - 1)) }
}

function progressiveTax(taxableIncome: number, brackets: [number, number][]): number {
  if (taxableIncome <= 0) return 0
  let tax = 0
  let prev = 0
  for (const [limit, rate] of brackets) {
    const chunk = Math.min(taxableIncome, limit) - prev
    if (chunk > 0) tax += chunk * rate
    prev = limit
    if (taxableIncome <= limit) break
  }
  return tax
}

function federalBasicPersonalAmount(netIncome: number): number {
  if (netIncome <= FEDERAL_BPA_PHASE_START) return FEDERAL_BPA_MAX
  if (netIncome >= FEDERAL_BPA_PHASE_END) return FEDERAL_BPA_MIN
  const additional = FEDERAL_BPA_MAX - FEDERAL_BPA_MIN
  const reduction =
    ((netIncome - FEDERAL_BPA_PHASE_START) / (FEDERAL_BPA_PHASE_END - FEDERAL_BPA_PHASE_START)) * additional
  return FEDERAL_BPA_MAX - reduction
}

function qppOnEarnings(annualEarnings: number) {
  const qpp1 = Math.max(0, Math.min(annualEarnings, YMPE) - QPP_BASIC_EXEMPTION)
  const qpp2 = Math.max(0, Math.min(annualEarnings, YAMPE) - YMPE)
  const combined = qpp1 * QPP_COMBINED_RATE + qpp2 * QPP2_RATE
  const baseCredit = qpp1 * QPP_BASE_RATE
  return { combined, baseCredit }
}

function roomAbove(used: number, cap: number) {
  return Math.max(0, cap - Math.max(0, used))
}

/** One-time extra this period: fill remaining annual room after salary (not annualized). */
function extraAgainstCap(extra: number, salaryAnnual: number, cap: number) {
  return Math.min(Math.max(0, extra), roomAbove(salaryAnnual, cap))
}

function annualFederalTax(
  income: number,
  qppBaseCredit: number,
  eiAnnual: number,
  qpipAnnual: number
): number {
  if (income <= 0) return 0
  const cea = Math.min(CANADA_EMPLOYMENT_AMOUNT, income)
  const bpa = federalBasicPersonalAmount(income)
  const grossTax = progressiveTax(income, FEDERAL_BRACKETS)
  const credits = (bpa + qppBaseCredit + eiAnnual + qpipAnnual + cea) * FEDERAL_LOWEST_RATE
  const basicFederal = Math.max(0, grossTax - credits)
  return Math.max(0, basicFederal * (1 - QUEBEC_FEDERAL_ABATEMENT))
}

function annualQuebecTax(employmentIncome: number, qppEmployee: number, qpipEmployee: number): number {
  if (employmentIncome <= 0) return 0
  const workerDeduction = Math.min(
    QUEBEC_WORKER_DEDUCTION_MAX,
    QUEBEC_WORKER_DEDUCTION_RATE * employmentIncome
  )
  const taxable = Math.max(0, employmentIncome - workerDeduction - qppEmployee)
  const grossTax = progressiveTax(taxable, QUEBEC_BRACKETS)
  const credits = (QUEBEC_BPA + qpipEmployee) * QUEBEC_LOWEST_RATE
  return Math.max(0, grossTax - credits)
}

export interface PayrollDeductions {
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  net_pay: number
}

export function calculatePayrollDeductions(params: {
  yearlySalary: number
  payFrequency: PayFrequency
  estimatedYearlyIncome?: number | null
  /** Extra pensionable / taxable amount this period only (e.g. taxable reimbursement HT). */
  extraTaxableThisPeriod?: number
  /** @deprecated Use extraTaxableThisPeriod — annualizing one-time amounts overstates withholdings. */
  extraTaxableAnnual?: number
  /** EI Act s. 5(2)(b): more than 40% of voting shares — not insurable. */
  eiExempt?: boolean
}): PayrollDeductions {
  const { yearlySalary, payFrequency } = params
  const periods = periodsPerYear(payFrequency)
  const extraFromAnnual =
    params.extraTaxableThisPeriod == null && params.extraTaxableAnnual
      ? Number(params.extraTaxableAnnual) / periods
      : 0
  const extra = Math.max(0, Number(params.extraTaxableThisPeriod ?? extraFromAnnual ?? 0))
  const salaryGross = grossPerPeriod(yearlySalary, payFrequency)
  const gross_pay = round2(salaryGross + extra)
  const taxIncome = Number(params.estimatedYearlyIncome ?? yearlySalary)

  const salaryQpp = qppOnEarnings(yearlySalary)
  let extraForQpp1 = extra
  if (yearlySalary < QPP_BASIC_EXEMPTION) {
    extraForQpp1 = Math.max(0, extra - (QPP_BASIC_EXEMPTION - yearlySalary))
  }
  const qpp1Already = Math.max(0, Math.min(yearlySalary, YMPE) - QPP_BASIC_EXEMPTION)
  const extraQpp1 = Math.min(extraForQpp1, YMPE - QPP_BASIC_EXEMPTION - qpp1Already)
  const extraAfterQpp1 = extraForQpp1 - extraQpp1
  const qpp2Already = Math.max(0, Math.min(yearlySalary, YAMPE) - YMPE)
  const extraQpp2 = Math.min(extraAfterQpp1, YAMPE - YMPE - qpp2Already)
  const extraQppCombined = extraQpp1 * QPP_COMBINED_RATE + extraQpp2 * QPP2_RATE
  const extraQppBaseCredit = extraQpp1 * QPP_BASE_RATE

  const cpp_employee = round2(salaryQpp.combined / periods + extraQppCombined)
  const cpp_employer = cpp_employee

  const salaryEi = params.eiExempt ? 0 : Math.min(yearlySalary, EI_MAX_INSURABLE) * EI_EMPLOYEE_RATE
  const extraEi = params.eiExempt
    ? 0
    : extraAgainstCap(extra, yearlySalary, EI_MAX_INSURABLE) * EI_EMPLOYEE_RATE
  const ei_employee = round2(salaryEi / periods + extraEi)
  const ei_employer = round2(ei_employee * EI_EMPLOYER_MULTIPLIER)

  const salaryQpip = Math.min(yearlySalary, QPIP_MAX_INSURABLE) * QPIP_EMPLOYEE_RATE
  const extraQpip = extraAgainstCap(extra, yearlySalary, QPIP_MAX_INSURABLE) * QPIP_EMPLOYEE_RATE
  const qpip_employee = round2(salaryQpip / periods + extraQpip)
  const salaryQpipEr = Math.min(yearlySalary, QPIP_MAX_INSURABLE) * QPIP_EMPLOYER_RATE
  const extraQpipEr = extraAgainstCap(extra, yearlySalary, QPIP_MAX_INSURABLE) * QPIP_EMPLOYER_RATE
  const qpip_employer = round2(salaryQpipEr / periods + extraQpipEr)

  const qppEmployeeAnnual = salaryQpp.combined + extraQppCombined
  const eiAnnual = salaryEi + extraEi
  const qpipAnnual = salaryQpip + extraQpip
  const qppBaseCreditAnnual = salaryQpp.baseCredit + extraQppBaseCredit

  const federalBase = annualFederalTax(taxIncome, salaryQpp.baseCredit, salaryEi, salaryQpip)
  const federalWithExtra = annualFederalTax(
    taxIncome + extra,
    qppBaseCreditAnnual,
    eiAnnual,
    qpipAnnual
  )
  const quebecBase = annualQuebecTax(taxIncome, salaryQpp.combined, salaryQpip)
  const quebecWithExtra = annualQuebecTax(taxIncome + extra, qppEmployeeAnnual, qpipAnnual)

  const federal_tax = round2(federalBase / periods + (federalWithExtra - federalBase))
  const provincial_tax = round2(quebecBase / periods + (quebecWithExtra - quebecBase))

  const net_pay = round2(
    gross_pay - federal_tax - provincial_tax - cpp_employee - ei_employee - qpip_employee
  )

  return {
    gross_pay,
    federal_tax,
    provincial_tax,
    cpp_employee,
    ei_employee,
    qpip_employee,
    cpp_employer,
    ei_employer,
    qpip_employer,
    net_pay,
  }
}

export function splitDividendEqually(totalAmount: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor((totalAmount / count) * 100) / 100
  const amounts = Array(count).fill(base)
  const remainder = round2(totalAmount - base * count)
  if (remainder > 0) amounts[0] = round2(amounts[0] + remainder)
  return amounts
}

export function splitDividendByShares(
  totalAmount: number,
  shareholders: { shares_held: number }[]
): number[] {
  if (shareholders.length === 0) return []
  const totalShares = shareholders.reduce((s, sh) => s + Number(sh.shares_held), 0)
  if (totalShares <= 0) return splitDividendEqually(totalAmount, shareholders.length)

  const amounts = shareholders.map((sh) =>
    round2(Math.floor((totalAmount * (Number(sh.shares_held) / totalShares)) * 100) / 100)
  )
  const assigned = round2(amounts.reduce((s, a) => s + a, 0))
  const remainder = round2(totalAmount - assigned)
  if (remainder > 0) amounts[0] = round2(amounts[0] + remainder)
  return amounts
}

export function employeeDisplayName(e: { first_name: string; last_name: string }): string {
  return `${e.first_name} ${e.last_name}`.trim()
}

/** Threshold is strictly more than 40% of voting shares (exactly 40% remains insurable). */
export const EI_VOTING_CONTROL_THRESHOLD = 0.4

export function votingShareRatio(
  employeeId: string,
  shareholders: { employee_id: string | null; shares_held: number; active: boolean }[]
): number | null {
  const active = shareholders.filter((s) => s.active)
  const total = active.reduce((s, sh) => s + Number(sh.shares_held), 0)
  if (total <= 0) return null
  const held = active
    .filter((s) => s.employee_id === employeeId)
    .reduce((s, sh) => s + Number(sh.shares_held), 0)
  return held / total
}

/** EI exemption: employee flag and/or cap table (shares_held used as voting proxy). */
export function isEiExemptOver40Voting(params: {
  over_40_percent_voting?: boolean | null
  employeeId?: string | null
  shareholders?: { employee_id: string | null; shares_held: number; active: boolean }[]
}): boolean {
  if (params.over_40_percent_voting) return true
  if (!params.employeeId || !params.shareholders) return false
  const ratio = votingShareRatio(params.employeeId, params.shareholders)
  return ratio != null && ratio > EI_VOTING_CONTROL_THRESHOLD
}

export const EMPLOYEE_DEDUCTION_FIELDS = [
  { key: 'federal_tax' as const, label: 'Impôt fédéral (retenue)' },
  { key: 'provincial_tax' as const, label: 'Impôt provincial (retenue)' },
  { key: 'cpp_employee' as const, label: 'RRQ / QPP — part employé' },
  { key: 'ei_employee' as const, label: 'AE Québec — part employé' },
  { key: 'qpip_employee' as const, label: 'RQAP — part employé' },
  { key: 'other_deductions' as const, label: 'Autres déductions' },
]

export const EMPLOYER_CONTRIBUTION_FIELDS = [
  { key: 'cpp_employer' as const, label: 'RRQ / QPP — part employeur' },
  { key: 'ei_employer' as const, label: 'AE Québec — part employeur' },
  { key: 'qpip_employer' as const, label: 'RQAP — part employeur' },
  { key: 'employer_benefits' as const, label: 'Avantages employeur' },
]

export function sumEmployeeDeductions(f: {
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  other_deductions: number
}): number {
  return (
    f.federal_tax +
    f.provincial_tax +
    f.cpp_employee +
    f.ei_employee +
    f.qpip_employee +
    f.other_deductions
  )
}

export function sumEmployerContributions(f: {
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  employer_benefits: number
  hsf_employer?: number
  cnesst_employer?: number
}): number {
  return (
    f.cpp_employer +
    f.ei_employer +
    f.qpip_employer +
    f.employer_benefits +
    Number(f.hsf_employer ?? 0) +
    Number(f.cnesst_employer ?? 0)
  )
}

export function calculateEmployerLevies(grossPay: number, hsfRate: number, cnesstRate: number) {
  return {
    hsf_employer: round2(grossPay * hsfRate),
    cnesst_employer: round2(grossPay * cnesstRate),
  }
}
