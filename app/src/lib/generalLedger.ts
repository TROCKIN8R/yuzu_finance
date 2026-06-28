import { isRevenueInvoice } from './taxes'

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
  { code: '2000', name: 'Comptes fournisseurs', type: 'liability' },
  { code: '2100', name: 'TPS à remettre', type: 'liability' },
  { code: '2110', name: 'TVQ à remettre', type: 'liability' },
  { code: '2200', name: 'Retenues à la source — impôts', type: 'liability' },
  { code: '2210', name: 'RPC / AE / RQAP à remettre', type: 'liability' },
  { code: '2300', name: 'Impôts société dus', type: 'liability' },
  { code: '3000', name: 'Avoir des propriétaires', type: 'equity' },
  { code: '3100', name: 'Dividendes déclarés', type: 'equity' },
  { code: '4000', name: 'Revenus de services', type: 'revenue' },
  { code: '5000', name: 'Dépenses d\'exploitation', type: 'expense' },
  { code: '5100', name: 'Salaires et traitements', type: 'expense' },
  { code: '5110', name: 'Charges sociales employeur', type: 'expense' },
]

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  software: 'Logiciels',
  office: 'Bureau',
  travel: 'Déplacements',
  professional: 'Services professionnels',
  marketing: 'Marketing',
  payroll: 'Paie (manuel)',
  other: 'Autres',
}

export interface JournalLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface JournalEntry {
  id: string
  date: string
  sourceType: string
  sourceId: string
  reference: string
  description: string
  lines: JournalLine[]
}

export interface TrialBalanceRow {
  accountCode: string
  accountName: string
  accountType: AccountType
  debit: number
  credit: number
  balance: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function acct(code: string): Account {
  const a = CHART_OF_ACCOUNTS.find((x) => x.code === code)
  if (!a) throw new Error(`Unknown account ${code}`)
  return a
}

function entry(
  id: string,
  date: string,
  sourceType: string,
  sourceId: string,
  reference: string,
  description: string,
  lines: JournalLine[]
): JournalEntry {
  const debits = round2(lines.reduce((s, l) => s + l.debit, 0))
  const credits = round2(lines.reduce((s, l) => s + l.credit, 0))
  if (Math.abs(debits - credits) > 0.01) {
    throw new Error(`Unbalanced entry ${reference}: ${debits} vs ${credits}`)
  }
  return { id, date, sourceType, sourceId, reference, description, lines }
}

function jl(code: string, debit: number, credit: number): JournalLine {
  const a = acct(code)
  return { accountCode: code, accountName: a.name, debit: round2(debit), credit: round2(credit) }
}

type PayrollRow = {
  id: string
  payment_date: string
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
  net_pay: number
}

function employerContributionsTotal(p: Pick<PayrollRow, 'cpp_employer' | 'ei_employer' | 'qpip_employer' | 'employer_benefits'>) {
  return (
    Number(p.cpp_employer) + Number(p.ei_employer) + Number(p.qpip_employer) + Number(p.employer_benefits)
  )
}

export function buildGeneralLedger(data: {
  invoices: {
    id: string
    invoice_number: string
    invoice_date: string
    subtotal: number
    gst: number
    qst: number
    total: number
    status: string
  }[]
  payments: {
    id: string
    payment_date: string
    amount: number
    invoice_id: string
    reference: string | null
    invoices?: { invoice_number: string } | { invoice_number: string }[]
  }[]
  expenses: {
    id: string
    expense_date: string
    vendor: string
    category: string
    description: string | null
    amount: number
    gst: number
    qst: number
    total: number
    paid: boolean
  }[]
  payrollRuns: PayrollRow[]
  dividends: { id: string; payment_date: string; total_amount: number; description: string | null }[]
  corporateTax: {
    id: string
    paid_date: string | null
    paid_amount: number
    label: string
    fiscal_year: string
  }[]
  salesTaxRemittances: {
    id: string
    period_end: string
    filed_date: string | null
    gst_net: number
    qst_net: number
    status: string
  }[]
}): JournalEntry[] {
  const entries: JournalEntry[] = []

  for (const inv of data.invoices) {
    if (!isRevenueInvoice(inv.status)) continue
    entries.push(
      entry(
        `inv-${inv.id}`,
        inv.invoice_date,
        'invoice',
        inv.id,
        inv.invoice_number,
        `Facture ${inv.invoice_number}`,
        [
          jl('1100', Number(inv.total), 0),
          jl('4000', 0, Number(inv.subtotal)),
          jl('2100', 0, Number(inv.gst)),
          jl('2110', 0, Number(inv.qst)),
        ]
      )
    )
  }

  for (const p of data.payments) {
    const invNum = Array.isArray(p.invoices)
      ? p.invoices[0]?.invoice_number
      : p.invoices?.invoice_number
    entries.push(
      entry(
        `pay-${p.id}`,
        p.payment_date,
        'payment',
        p.id,
        p.reference ?? invNum ?? p.id.slice(0, 8),
        `Paiement client${invNum ? ` — ${invNum}` : ''}`,
        [jl('1010', Number(p.amount), 0), jl('1100', 0, Number(p.amount))]
      )
    )
  }

  for (const e of data.expenses) {
    const cat = EXPENSE_CATEGORY_LABELS[e.category] ?? e.category
    const desc = e.description ? `${e.vendor} — ${e.description}` : e.vendor
    const creditAccount = e.paid ? '1010' : '2000'
    const lines: JournalLine[] = [
      jl('5000', Number(e.amount), 0),
      jl('1200', Number(e.gst), 0),
      jl('1210', Number(e.qst), 0),
      jl(creditAccount, 0, Number(e.total)),
    ]
    entries.push(
      entry(`exp-${e.id}`, e.expense_date, 'expense', e.id, e.vendor, `Dépense — ${cat}: ${desc}`, lines)
    )
  }

  for (const pr of data.payrollRuns) {
    const employerContrib = employerContributionsTotal(pr)
    const incomeTax = Number(pr.federal_tax) + Number(pr.provincial_tax) + Number(pr.other_deductions)
    const statutory =
      Number(pr.cpp_employee) +
      Number(pr.ei_employee) +
      Number(pr.qpip_employee) +
      Number(pr.cpp_employer) +
      Number(pr.ei_employer) +
      Number(pr.qpip_employer) +
      Number(pr.employer_benefits)

    entries.push(
      entry(
        `payroll-${pr.id}`,
        pr.payment_date,
        'payroll',
        pr.id,
        pr.payment_date,
        `Paie du ${pr.payment_date}`,
        [
          jl('5100', Number(pr.gross_pay), 0),
          jl('5110', employerContrib, 0),
          jl('1010', 0, Number(pr.net_pay)),
          jl('2200', 0, incomeTax),
          jl('2210', 0, statutory),
        ]
      )
    )
  }

  for (const d of data.dividends) {
    entries.push(
      entry(
        `div-${d.id}`,
        d.payment_date,
        'dividend',
        d.id,
        d.payment_date,
        d.description ?? 'Dividendes',
        [jl('3100', Number(d.total_amount), 0), jl('1010', 0, Number(d.total_amount))]
      )
    )
  }

  for (const ct of data.corporateTax) {
    if (!ct.paid_date || Number(ct.paid_amount) <= 0) continue
    entries.push(
      entry(
        `ctax-${ct.id}-${ct.paid_date}`,
        ct.paid_date,
        'corporate_tax',
        ct.id,
        ct.fiscal_year,
        `Impôt société — ${ct.label}`,
        [jl('2300', Number(ct.paid_amount), 0), jl('1010', 0, Number(ct.paid_amount))]
      )
    )
  }

  for (const st of data.salesTaxRemittances) {
    if (st.status !== 'paid') continue
    const remitDate = st.filed_date ?? st.period_end
    const gst = Math.max(0, Number(st.gst_net))
    const qst = Math.max(0, Number(st.qst_net))
    const totalRemit = round2(gst + qst)
    if (totalRemit <= 0) continue
    const lines: JournalLine[] = []
    if (gst > 0) lines.push(jl('2100', gst, 0))
    if (qst > 0) lines.push(jl('2110', qst, 0))
    lines.push(jl('1010', 0, totalRemit))
    entries.push(
      entry(
        `stax-${st.id}`,
        remitDate,
        'sales_tax',
        st.id,
        remitDate,
        `Remise TPS/TVQ — fin ${st.period_end}`,
        lines
      )
    )
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))
}

export function flattenJournalEntries(entries: JournalEntry[]) {
  return entries.flatMap((e) =>
    e.lines.map((line) => ({
      entryId: e.id,
      date: e.date,
      reference: e.reference,
      description: e.description,
      sourceType: e.sourceType,
      ...line,
    }))
  )
}

export function buildTrialBalance(entries: JournalEntry[]): TrialBalanceRow[] {
  const totals = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    for (const line of e.lines) {
      const cur = totals.get(line.accountCode) ?? { debit: 0, credit: 0 }
      cur.debit += line.debit
      cur.credit += line.credit
      totals.set(line.accountCode, cur)
    }
  }

  return CHART_OF_ACCOUNTS.map((account) => {
    const t = totals.get(account.code) ?? { debit: 0, credit: 0 }
    const debit = round2(t.debit)
    const credit = round2(t.credit)
    const balance =
      account.type === 'asset' || account.type === 'expense'
        ? round2(debit - credit)
        : round2(credit - debit)
    return {
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      debit,
      credit,
      balance,
    }
  }).filter((r) => r.debit > 0 || r.credit > 0)
}

export function journalTotals(entries: JournalEntry[]) {
  const flat = flattenJournalEntries(entries)
  return {
    debit: round2(flat.reduce((s, l) => s + l.debit, 0)),
    credit: round2(flat.reduce((s, l) => s + l.credit, 0)),
  }
}

// Re-export payroll helpers used by ledger from financials
export { payrollEmployerTotal, payrollRemittancesTotal }
