import type { Employee, EmployeeExpense, Shareholder } from './types'
import { payPeriodRange, calculatePayrollDeductions, isEiExemptOver40Voting } from './payrollCalc'
import { grossWithTaxableReimbursement, reimbursementTotals } from './reimbursement'

export function recalculatePayrollWithReimbursements(params: {
  emp: Pick<Employee, 'id' | 'yearly_salary' | 'pay_frequency' | 'estimated_yearly_income' | 'over_40_percent_voting'>
  salaryGrossBase: number
  expenses: Pick<EmployeeExpense, 'id' | 'amount' | 'total' | 'taxable'>[]
  selectedIds: Set<string>
  paymentDate: string
  shareholders?: Pick<Shareholder, 'employee_id' | 'shares_held' | 'active'>[]
}) {
  const { emp, salaryGrossBase, expenses, selectedIds, paymentDate, shareholders } = params
  const range = payPeriodRange(paymentDate, emp.pay_frequency)
  const reimb = reimbursementTotals(expenses, selectedIds)
  const gross_pay = grossWithTaxableReimbursement(salaryGrossBase, reimb.taxable)
  const eiExempt = isEiExemptOver40Voting({
    over_40_percent_voting: emp.over_40_percent_voting,
    employeeId: emp.id,
    shareholders,
  })
  const calc = calculatePayrollDeductions({
    yearlySalary: Number(emp.yearly_salary),
    payFrequency: emp.pay_frequency,
    estimatedYearlyIncome: emp.estimated_yearly_income,
    extraTaxableThisPeriod: reimb.taxable,
    eiExempt,
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
    eiExempt,
    reimbursement: reimb,
  }
}
