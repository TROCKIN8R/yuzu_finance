import type { EmployeeExpense } from './types'

export function reimbursementTotals(
  expenses: Pick<EmployeeExpense, 'id' | 'amount' | 'total' | 'taxable'>[],
  selectedIds: Set<string>
) {
  let taxable = 0
  let nonTaxable = 0
  for (const e of expenses) {
    if (!selectedIds.has(e.id)) continue
    if (e.taxable) taxable += Number(e.amount)
    else nonTaxable += Number(e.total)
  }
  return { taxable, nonTaxable, total: taxable + nonTaxable }
}

export function grossWithTaxableReimbursement(salaryGross: number, taxableReimbursement: number) {
  return salaryGross + taxableReimbursement
}

export function netPayWithReimbursement(
  salaryNet: number,
  nonTaxableReimbursement: number
) {
  return salaryNet + nonTaxableReimbursement
}
