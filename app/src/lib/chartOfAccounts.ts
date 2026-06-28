import type { ExpenseCategory } from './types'

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface Account {
  code: string
  name: string
  type: AccountType
}

export const CHART_OF_ACCOUNTS: Account[] = [
  { code: '1010', name: 'Banque / Trésorerie', type: 'asset' },
  { code: '1100', name: 'Comptes clients', type: 'asset' },
  { code: '1200', name: 'TPS à recevoir (CTI)', type: 'asset' },
  { code: '1210', name: 'TVQ à recevoir (RTI)', type: 'asset' },
  { code: '1400', name: 'Charges payées d\'avance', type: 'asset' },
  { code: '1500', name: 'Amortissement cumulé', type: 'asset' },
  { code: '2000', name: 'Comptes fournisseurs', type: 'liability' },
  { code: '2050', name: 'Charges à payer', type: 'liability' },
  { code: '2060', name: 'Remboursements dus à l\'employé', type: 'liability' },
  { code: '2100', name: 'TPS à remettre', type: 'liability' },
  { code: '2110', name: 'TVQ à remettre', type: 'liability' },
  { code: '2125', name: 'Dividendes à payer', type: 'liability' },
  { code: '2200', name: 'Retenues à la source — impôts', type: 'liability' },
  { code: '2210', name: 'RPC / AE / RQAP à remettre', type: 'liability' },
  { code: '2300', name: 'Impôts société dus', type: 'liability' },
  { code: '2310', name: 'Provision impôts société', type: 'liability' },
  { code: '3000', name: 'Capital-actions', type: 'equity' },
  { code: '3100', name: 'Bénéfices non répartis', type: 'equity' },
  { code: '3200', name: 'Dividendes déclarés', type: 'equity' },
  { code: '4000', name: 'Revenus de services', type: 'revenue' },
  { code: '5010', name: 'Logiciels', type: 'expense' },
  { code: '5020', name: 'Bureau', type: 'expense' },
  { code: '5030', name: 'Déplacements', type: 'expense' },
  { code: '5040', name: 'Services professionnels', type: 'expense' },
  { code: '5050', name: 'Marketing', type: 'expense' },
  { code: '5060', name: 'Paie (manuel)', type: 'expense' },
  { code: '5090', name: 'Autres dépenses', type: 'expense' },
  { code: '5100', name: 'Salaires et traitements', type: 'expense' },
  { code: '5110', name: 'Charges sociales employeur', type: 'expense' },
  { code: '5200', name: 'Amortissement', type: 'expense' },
]

const EXPENSE_CATEGORY_ACCOUNTS: Record<ExpenseCategory, string> = {
  software: '5010',
  office: '5020',
  travel: '5030',
  professional: '5040',
  marketing: '5050',
  payroll: '5060',
  other: '5090',
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Logiciels',
  office: 'Bureau',
  travel: 'Déplacements',
  professional: 'Services professionnels',
  marketing: 'Marketing',
  payroll: 'Paie (manuel)',
  other: 'Autres',
}

export function expenseCategoryAccount(category: string): string {
  return EXPENSE_CATEGORY_ACCOUNTS[category as ExpenseCategory] ?? '5090'
}

export function accountByCode(code: string): Account | undefined {
  return CHART_OF_ACCOUNTS.find((a) => a.code === code)
}

export function accountName(code: string): string {
  return accountByCode(code)?.name ?? code
}
