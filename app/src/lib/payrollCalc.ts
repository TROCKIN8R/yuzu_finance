import type { PayFrequency } from './types'
import { addDays } from './format'

/** Quebec payroll estimates — 2025 rates, for planning only. */
const YMPE = 71_300
const CPP_BASIC_EXEMPTION = 3_500
const CPP_EMPLOYEE_RATE = 0.064
const EI_MAX_INSURABLE = 65_700
const EI_EMPLOYEE_RATE = 0.0164
const EI_EMPLOYER_MULTIPLIER = 1.4
const QPIP_MAX_INSURABLE = 98_000
const QPIP_EMPLOYEE_RATE = 0.00494
const QPIP_EMPLOYER_RATE = 0.00692
const FEDERAL_BASIC = 15_705
const QUEBEC_BASIC = 18_056

const FEDERAL_BRACKETS: [number, number][] = [
  [57_375, 0.15],
  [114_750, 0.205],
  [177_882, 0.26],
  [253_414, 0.29],
  [Infinity, 0.33],
]

const QUEBEC_BRACKETS: [number, number][] = [
  [53_255, 0.14],
  [106_495, 0.19],
  [129_590, 0.24],
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
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
  /** Used for income-tax withholding when different from salary (e.g. other income). */
  estimatedYearlyIncome?: number | null
}): PayrollDeductions {
  const { yearlySalary, payFrequency } = params
  const periods = periodsPerYear(payFrequency)
  const gross_pay = grossPerPeriod(yearlySalary, payFrequency)
  const taxIncome = params.estimatedYearlyIncome ?? yearlySalary

  const pensionableAnnual = Math.max(0, Math.min(yearlySalary, YMPE) - CPP_BASIC_EXEMPTION)
  const cpp_employee = round2((pensionableAnnual * CPP_EMPLOYEE_RATE) / periods)
  const cpp_employer = cpp_employee

  const eiInsurable = Math.min(yearlySalary, EI_MAX_INSURABLE)
  const ei_employee = round2((eiInsurable * EI_EMPLOYEE_RATE) / periods)
  const ei_employer = round2((eiInsurable * EI_EMPLOYEE_RATE * EI_EMPLOYER_MULTIPLIER) / periods)

  const qpipInsurable = Math.min(yearlySalary, QPIP_MAX_INSURABLE)
  const qpip_employee = round2((qpipInsurable * QPIP_EMPLOYEE_RATE) / periods)
  const qpip_employer = round2((qpipInsurable * QPIP_EMPLOYER_RATE) / periods)

  const federalAnnual = progressiveTax(Math.max(0, taxIncome - FEDERAL_BASIC), FEDERAL_BRACKETS)
  const provincialAnnual = progressiveTax(Math.max(0, taxIncome - QUEBEC_BASIC), QUEBEC_BRACKETS)
  const federal_tax = round2(federalAnnual / periods)
  const provincial_tax = round2(provincialAnnual / periods)

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

export function splitDividendEqually(totalAmount: number, employeeCount: number): number[] {
  if (employeeCount <= 0) return []
  const base = Math.floor((totalAmount / employeeCount) * 100) / 100
  const amounts = Array(employeeCount).fill(base)
  const remainder = round2(totalAmount - base * employeeCount)
  if (remainder > 0) amounts[0] = round2(amounts[0] + remainder)
  return amounts
}

export function employeeDisplayName(e: { first_name: string; last_name: string }): string {
  return `${e.first_name} ${e.last_name}`.trim()
}

export const EMPLOYEE_DEDUCTION_FIELDS = [
  { key: 'federal_tax' as const, label: 'Impôt fédéral (retenue)' },
  { key: 'provincial_tax' as const, label: 'Impôt provincial (retenue)' },
  { key: 'cpp_employee' as const, label: 'RPC — part employé' },
  { key: 'ei_employee' as const, label: 'AE — part employé' },
  { key: 'qpip_employee' as const, label: 'RQAP — part employé' },
  { key: 'other_deductions' as const, label: 'Autres déductions' },
]

export const EMPLOYER_CONTRIBUTION_FIELDS = [
  { key: 'cpp_employer' as const, label: 'RPC — part employeur' },
  { key: 'ei_employer' as const, label: 'AE — part employeur' },
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
}): number {
  return f.cpp_employer + f.ei_employer + f.qpip_employer + f.employer_benefits
}
