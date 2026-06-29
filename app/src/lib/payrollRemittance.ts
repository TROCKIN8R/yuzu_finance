/** CRA RP / Revenu Québec TPZ remittances — excludes employer-paid benefits (paid to insurers separately). */

export type PayrollRemittanceFields = {
  federal_tax: number
  provincial_tax: number
  other_deductions: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  employer_benefits: number
  hsf_employer?: number
  cnesst_employer?: number
}

export function payrollIncomeTaxWithheld(p: Pick<
  PayrollRemittanceFields,
  'federal_tax' | 'provincial_tax' | 'other_deductions'
>): number {
  return Number(p.federal_tax) + Number(p.provincial_tax) + Number(p.other_deductions)
}

export function payrollStatutoryRemittance(p: Pick<
  PayrollRemittanceFields,
  'cpp_employee' | 'ei_employee' | 'qpip_employee' | 'cpp_employer' | 'ei_employer' | 'qpip_employer'
>): number {
  return (
    Number(p.cpp_employee) +
    Number(p.ei_employee) +
    Number(p.qpip_employee) +
    Number(p.cpp_employer) +
    Number(p.ei_employer) +
    Number(p.qpip_employer)
  )
}

export function employerStatutoryContributions(p: Pick<
  PayrollRemittanceFields,
  'cpp_employer' | 'ei_employer' | 'qpip_employer'
>): number {
  return Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer)
}

export function payrollLeviesRemittance(p: Pick<PayrollRemittanceFields, 'hsf_employer' | 'cnesst_employer'>): number {
  return Number(p.hsf_employer ?? 0) + Number(p.cnesst_employer ?? 0)
}

export function employerPayrollExpenseContributions(p: PayrollRemittanceFields): number {
  return employerStatutoryContributions(p) + Number(p.employer_benefits) + payrollLeviesRemittance(p)
}

/** Total due to CRA / Revenu Québec for source deductions on a payroll run. */
export function payrollRemittancesTotal(p: PayrollRemittanceFields): number {
  return payrollIncomeTaxWithheld(p) + payrollStatutoryRemittance(p)
}
