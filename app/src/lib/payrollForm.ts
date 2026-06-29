import type { Employee, EmployeeExpense } from './types'
import { payPeriodRange, calculatePayrollDeductions, periodsPerYear } from './payrollCalc'
import { grossWithTaxableReimbursement, reimbursementTotals } from './reimbursement'

export function recalculatePayrollWithReimbursements(params: {
  emp: Pick<Employee, 'yearly_salary' | 'pay_frequency' | 'estimated_yearly_income'>
  salaryGrossBase: number
  expenses: Pick<EmployeeExpense, 'id' | 'amount' | 'total' | 'taxable'>[]
  selectedIds: Set<string>
  paymentDate: string
}) {
  const { emp, salaryGrossBase, expenses, selectedIds, paymentDate } = params
  const range = payPeriodRange(paymentDate, emp.pay_frequency)
  const reimb = reimbursementTotals(expenses, selectedIds)
  const gross_pay = grossWithTaxableReimbursement(salaryGrossBase, reimb.taxable)
  const periods = periodsPerYear(emp.pay_frequency)
  const calc = calculatePayrollDeductions({
    yearlySalary: Number(emp.yearly_salary),
    payFrequency: emp.pay_frequency,
    estimatedYearlyIncome: emp.estimated_yearly_income,
    extraTaxableAnnual: reimb.taxable * periods,
  })
  return {
    pay_period_start: range.start,
    pay_period_end: range.end,
    gross_pay,
    federal_tax: calc.federal_tax,
    provincial_tax: calc.provincial_tax,
    cpp_employee: calc.cpp_employee,
    ei_employee: calc.ei_employee,
    qpip_employee: calc.qpip_employee,
    cpp_employer: calc.cpp_employer,
    ei_employer: calc.ei_employer,
    qpip_employer: calc.qpip_employer,
    reimbursement: reimb,
  }
}
