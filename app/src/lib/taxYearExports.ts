import type { Dividend, Employee, PayrollRun, Shareholder } from './types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export type CsvRow = string[]

export function buildT4Rl1Schedule(
  year: number,
  employees: Employee[],
  payrollRuns: PayrollRun[]
): CsvRow[] {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const inYear = payrollRuns.filter((p) => p.payment_date >= yearStart && p.payment_date <= yearEnd)

  const header: CsvRow = [
    'Année',
    'Employé',
    'Brut (case 14 / A)',
    'Impôt fédéral retenu',
    'Impôt provincial retenu (RL-1)',
    'RRQ/QPP employé',
    'AE employé',
    'RQAP employé',
    'RRQ/QPP employeur',
    'AE employeur',
    'RQAP employeur',
    'HSF employeur (estimé)',
    'CNESST employeur (estimé)',
    'Autres déductions',
    'Net versé',
    'Nb périodes',
  ]

  const byEmployee = new Map<string, PayrollRun[]>()
  for (const run of inYear) {
    if (!run.employee_id) continue
    const list = byEmployee.get(run.employee_id) ?? []
    list.push(run)
    byEmployee.set(run.employee_id, list)
  }

  const rows: CsvRow[] = [header]

  for (const emp of employees) {
    const runs = byEmployee.get(emp.id) ?? []
    if (runs.length === 0) continue
    const sum = (field: keyof PayrollRun) => runs.reduce((s, r) => s + Number(r[field] ?? 0), 0)
    rows.push([
      String(year),
      `${emp.first_name} ${emp.last_name}`.trim(),
      sum('gross_pay').toFixed(2),
      sum('federal_tax').toFixed(2),
      sum('provincial_tax').toFixed(2),
      sum('cpp_employee').toFixed(2),
      sum('ei_employee').toFixed(2),
      sum('qpip_employee').toFixed(2),
      sum('cpp_employer').toFixed(2),
      sum('ei_employer').toFixed(2),
      sum('qpip_employer').toFixed(2),
      sum('hsf_employer' as keyof PayrollRun).toFixed(2),
      sum('cnesst_employer' as keyof PayrollRun).toFixed(2),
      sum('other_deductions').toFixed(2),
      sum('net_pay').toFixed(2),
      String(runs.length),
    ])
  }

  if (rows.length === 1) {
    rows.push([String(year), '(aucune paie)', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'])
  }

  return rows
}

export function buildT5Schedule(
  year: number,
  shareholders: Shareholder[],
  dividends: Dividend[],
  allocations: { shareholder_id: string; dividend_id: string; amount: number }[]
): CsvRow[] {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const inYear = dividends.filter((d) => d.declared_date >= yearStart && d.declared_date <= yearEnd)

  const header: CsvRow = [
    'Année',
    'Actionnaire',
    'Actions détenues',
    'Dividendes déclarés',
    'Dividendes payés (si connu)',
    'Nb déclarations',
  ]

  const amountByShareholder = new Map<string, { declared: number; paid: number; count: number }>()
  for (const div of inYear) {
    const divAllocs = allocations.filter((a) => a.dividend_id === div.id)
    for (const alloc of divAllocs) {
      const prev = amountByShareholder.get(alloc.shareholder_id) ?? { declared: 0, paid: 0, count: 0 }
      prev.declared += Number(alloc.amount)
      if (div.status === 'paid') prev.paid += Number(alloc.amount)
      prev.count += 1
      amountByShareholder.set(alloc.shareholder_id, prev)
    }
    if (divAllocs.length === 0 && shareholders.length === 1) {
      const sh = shareholders[0]
      const prev = amountByShareholder.get(sh.id) ?? { declared: 0, paid: 0, count: 0 }
      prev.declared += Number(div.total_amount)
      if (div.status === 'paid') prev.paid += Number(div.paid_amount ?? div.total_amount)
      prev.count += 1
      amountByShareholder.set(sh.id, prev)
    }
  }

  const rows: CsvRow[] = [header]
  for (const sh of shareholders) {
    const totals = amountByShareholder.get(sh.id)
    if (!totals) continue
    rows.push([
      String(year),
      sh.legal_name,
      String(sh.shares_held),
      totals.declared.toFixed(2),
      totals.paid.toFixed(2),
      String(totals.count),
    ])
  }

  if (rows.length === 1) {
    rows.push([String(year), '(aucun dividende)', '0', '0', '0', '0'])
  }

  return rows
}

export interface Co17ScheduleInput {
  year: number
  revenueSubtotal: number
  operatingExpenses: number
  payrollGross: number
  employerPayrollContributions: number
  operatingIncome: number
  corpTaxProvision: number
  corpTaxPaid: number
  estimatedRate: number
}

export function buildCo17Schedule(input: Co17ScheduleInput): CsvRow[] {
  const taxableEstimate = round2(Math.max(0, input.operatingIncome))
  const provisionEstimate = round2(taxableEstimate * input.estimatedRate)
  return [
    ['Section', 'Montant (CAD)', 'Notes'],
    ['Exercice', String(input.year), 'Brouillon — CO-17 / T2'],
    ['Revenus de services', input.revenueSubtotal.toFixed(2), 'État des résultats'],
    ['Charges d\'exploitation', input.operatingExpenses.toFixed(2), 'Hors paie'],
    ['Salaires bruts', input.payrollGross.toFixed(2), 'Compte 5100'],
    ['Charges patronales', input.employerPayrollContributions.toFixed(2), 'Compte 5110'],
    ['Revenu d\'exploitation', input.operatingIncome.toFixed(2), 'Avant impôt société'],
    ['Revenu imposable estimé', taxableEstimate.toFixed(2), 'Pour planification seulement'],
    ['Taux estimé', `${(input.estimatedRate * 100).toFixed(2)}%`, 'organization_settings'],
    ['Provision estimée', provisionEstimate.toFixed(2), 'Comparaison compte 5900/2310'],
    ['Provision GL (période)', input.corpTaxProvision.toFixed(2), 'Grand livre'],
    ['Impôt payé (période)', input.corpTaxPaid.toFixed(2), 'Encaissements'],
  ]
}

export function downloadScheduleCsv(filename: string, rows: CsvRow[]) {
  const escape = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
  const bom = '\uFEFF'
  const body = rows.map((r) => r.map(escape).join(',')).join('\n')
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
