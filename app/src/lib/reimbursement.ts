import type { EmployeeExpense } from './types'
import { round2 } from './taxes'

export type ReimbursementTotals = {
  /** HT of taxable items — added to employment income / brut. */
  taxable: number
  /** Cash added to net without going through brut (non-tax TTC + TPS/TVQ on taxable). */
  nonTaxable: number
  /** Full TTC reimbursed to the employee. */
  total: number
}

export function reimbursementTotals(
  expenses: Pick<EmployeeExpense, 'id' | 'amount' | 'total' | 'taxable'>[],
  selectedIds: Set<string>
): ReimbursementTotals {
  let taxable = 0
  let nonTaxable = 0
  let total = 0
  for (const e of expenses) {
    if (!selectedIds.has(e.id)) continue
    const amount = Number(e.amount)
    const lineTotal = Number(e.total)
    total = round2(total + lineTotal)
    if (e.taxable) {
      taxable = round2(taxable + amount)
      nonTaxable = round2(nonTaxable + (lineTotal - amount))
    } else {
      nonTaxable = round2(nonTaxable + lineTotal)
    }
  }
  return { taxable, nonTaxable, total }
}

export function grossWithTaxableReimbursement(salaryGross: number, taxableReimbursement: number) {
  return round2(salaryGross + taxableReimbursement)
}

export function netPayWithReimbursement(salaryNet: number, nonTaxableReimbursement: number) {
  return round2(salaryNet + nonTaxableReimbursement)
}
