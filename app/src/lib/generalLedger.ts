import { isRevenueInvoice } from './taxes'
import {
  CHART_OF_ACCOUNTS,
  expenseCategoryAccount,
  EXPENSE_CATEGORY_LABELS,
  accountName,
  type AccountType,
} from './chartOfAccounts'
import { lastDayOfMonth, monthsInRange } from './fiscalPeriod'
import type { AccountingAdjustment, OrganizationSettings } from './types'

export type { AccountType, Account } from './chartOfAccounts'
export { CHART_OF_ACCOUNTS }

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

function acct(code: string) {
  const a = CHART_OF_ACCOUNTS.find((x) => x.code === code)
  if (!a) return { code, name: accountName(code), type: 'expense' as const }
  return a
}

function invoiceStatusFromPayment(p: {
  invoices?: { invoice_number: string; status?: string } | { invoice_number: string; status?: string }[]
}): string | undefined {
  const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
  return inv?.status
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
  reimbursement_total?: number
  remittance_status?: string
  remittance_date?: string | null
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
    invoices?: { invoice_number: string; status?: string } | { invoice_number: string; status?: string }[]
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
    payroll_run_id?: string | null
  }[]
  employeeExpenses?: {
    id: string
    expense_date: string
    vendor: string
    category: string
    description: string | null
    amount: number
    gst: number
    qst: number
    total: number
    taxable: boolean
    payroll_run_id?: string | null
  }[]
  payrollRuns: PayrollRow[]
  dividends: {
    id: string
    declared_date: string
    payment_date: string | null
    status: string
    total_amount: number
    paid_amount?: number
    description: string | null
  }[]
  corporateTax: {
    id: string
    paid_date: string | null
    paid_amount: number
    amount: number
    status: string
    due_date: string | null
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
  adjustments?: AccountingAdjustment[]
  settings?: Pick<
    OrganizationSettings,
    'share_capital' | 'opening_retained_earnings' | 'opening_cash_balance' | 'opening_balance_date'
  > | null
  periodEnd?: string
}): JournalEntry[] {
  const entries: JournalEntry[] = []

  entries.push(...buildOpeningBalanceEntries(data.settings))

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
    if (invoiceStatusFromPayment(p) === 'void') continue
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
    if (e.category === 'payroll' || e.payroll_run_id) continue
    const cat = EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? e.category
    const desc = e.description ? `${e.vendor} — ${e.description}` : e.vendor
    const creditAccount = e.paid ? '1010' : '2000'
    const expenseAccount = expenseCategoryAccount(e.category)
    const lines: JournalLine[] = [
      jl(expenseAccount, Number(e.amount), 0),
      jl('1200', Number(e.gst), 0),
      jl('1210', Number(e.qst), 0),
      jl(creditAccount, 0, Number(e.total)),
    ]
    entries.push(
      entry(`exp-${e.id}`, e.expense_date, 'expense', e.id, e.vendor, `Dépense — ${cat}: ${desc}`, lines)
    )
  }

  for (const e of data.employeeExpenses ?? []) {
    if (e.payroll_run_id || e.taxable) continue
    const cat = EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? e.category
    const desc = e.description ? `${e.vendor} — ${e.description}` : e.vendor
    const expenseAccount = expenseCategoryAccount(e.category)
    const lines: JournalLine[] = [
      jl(expenseAccount, Number(e.amount), 0),
      jl('1200', Number(e.gst), 0),
      jl('1210', Number(e.qst), 0),
      jl('2060', 0, Number(e.total)),
    ]
    entries.push(
      entry(
        `ee-${e.id}`,
        e.expense_date,
        'employee_expense',
        e.id,
        e.vendor,
        `Frais employé — ${cat}: ${desc}`,
        lines
      )
    )
  }

  for (const pr of data.payrollRuns) {
    const linked = (data.employeeExpenses ?? []).filter((e) => e.payroll_run_id === pr.id && !e.taxable)
    const nonTaxReimb = linked.reduce((s, e) => s + Number(e.total), 0)
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

    const payrollLines: JournalLine[] = [
      jl('5100', Number(pr.gross_pay), 0),
      jl('5110', employerContrib, 0),
      jl('1010', 0, Number(pr.net_pay)),
      jl('2200', 0, incomeTax),
      jl('2210', 0, statutory),
    ]
    if (nonTaxReimb > 0) payrollLines.push(jl('2060', nonTaxReimb, 0))

    entries.push(
      entry(
        `payroll-${pr.id}`,
        pr.payment_date,
        'payroll',
        pr.id,
        pr.payment_date,
        `Paie du ${pr.payment_date}`,
        payrollLines
      )
    )

    if (pr.remittance_status === 'remitted' && pr.remittance_date) {
      const remitTotal = round2(incomeTax + statutory)
      if (remitTotal > 0) {
        const lines: JournalLine[] = []
        if (incomeTax > 0) lines.push(jl('2200', incomeTax, 0))
        if (statutory > 0) lines.push(jl('2210', statutory, 0))
        lines.push(jl('1010', 0, remitTotal))
        entries.push(
          entry(
            `payroll-remit-${pr.id}`,
            pr.remittance_date,
            'payroll_remittance',
            pr.id,
            pr.remittance_date,
            `Remise à la source — paie ${pr.payment_date}`,
            lines
          )
        )
      }
    }
  }

  for (const d of data.dividends) {
    entries.push(
      entry(
        `div-decl-${d.id}`,
        d.declared_date,
        'dividend_declared',
        d.id,
        d.declared_date,
        d.description ?? 'Dividendes déclarés',
        [jl('3100', Number(d.total_amount), 0), jl('2125', 0, Number(d.total_amount))]
      )
    )
    if (Number(d.paid_amount ?? 0) > 0 && d.payment_date) {
      const paidAmount = Number(d.paid_amount)
      entries.push(
        entry(
          `div-pay-${d.id}`,
          d.payment_date,
          'dividend',
          d.id,
          d.payment_date,
          d.description ?? 'Paiement dividendes',
          [jl('2125', paidAmount, 0), jl('1010', 0, paidAmount)]
        )
      )
    }
  }

  for (const ct of data.corporateTax) {
    const owed = round2(Number(ct.amount) - Number(ct.paid_amount))
    const accrualDate = ct.due_date ?? ct.paid_date
    if (owed > 0 && accrualDate && (ct.status === 'estimated' || ct.status === 'due')) {
      entries.push(
        entry(
          `ctax-prov-${ct.id}`,
          accrualDate,
          'corporate_tax_provision',
          ct.id,
          ct.fiscal_year,
          `Provision impôt société — ${ct.label}`,
          [jl('5900', owed, 0), jl('2310', 0, owed)]
        )
      )
    }
    if (ct.paid_date && Number(ct.paid_amount) > 0) {
      const paid = Number(ct.paid_amount)
      const useExpenseDirect = ct.status === 'paid' && owed <= 0
      entries.push(
        entry(
          `ctax-${ct.id}-${ct.paid_date}`,
          ct.paid_date,
          'corporate_tax',
          ct.id,
          ct.fiscal_year,
          `Impôt société — ${ct.label}`,
          useExpenseDirect
            ? [jl('5900', paid, 0), jl('1010', 0, paid)]
            : [jl('2310', paid, 0), jl('1010', 0, paid)]
        )
      )
    }
  }

  for (const st of data.salesTaxRemittances) {
    if (st.status !== 'paid') continue
    const remitDate = st.filed_date ?? st.period_end
    const gst = Number(st.gst_net)
    const qst = Number(st.qst_net)
    const totalRemit = round2(gst + qst)
    if (Math.abs(totalRemit) < 0.01) continue
    const lines: JournalLine[] = []
    if (gst > 0) lines.push(jl('2100', gst, 0))
    else if (gst < 0) lines.push(jl('1200', 0, Math.abs(gst)))
    if (qst > 0) lines.push(jl('2110', qst, 0))
    else if (qst < 0) lines.push(jl('1210', 0, Math.abs(qst)))
    if (totalRemit > 0) lines.push(jl('1010', 0, totalRemit))
    else lines.push(jl('1010', Math.abs(totalRemit), 0))
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

  const cap = data.periodEnd ?? '9999-12-31'
  for (const adj of data.adjustments ?? []) {
    if (!adj.active) continue
    const end = adj.end_date ?? adj.start_date
    if (adj.adjustment_type === 'manual') {
      const amt = round2(Number(adj.total_amount ?? adj.monthly_amount ?? 0))
      if (amt > 0 && adj.start_date <= cap) {
        entries.push(
          entry(
            `adj-${adj.id}`,
            adj.start_date,
            'adjustment',
            adj.id,
            adj.adjustment_type,
            adj.description,
            [jl(adj.debit_account, amt, 0), jl(adj.credit_account, 0, amt)]
          )
        )
      }
      continue
    }
    const monthly = Number(adj.monthly_amount ?? 0)
    if (monthly <= 0) continue
    const months = monthsInRange(adj.start_date, end, cap)
    for (const ym of months) {
      const postDate = lastDayOfMonth(ym)
      entries.push(
        entry(
          `adj-${adj.id}-${ym}`,
          postDate,
          'adjustment',
          adj.id,
          ym,
          `${adj.description} (${ym})`,
          [jl(adj.debit_account, monthly, 0), jl(adj.credit_account, 0, monthly)]
        )
      )
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))
}

export function buildOpeningBalanceEntries(
  settings: Pick<
    OrganizationSettings,
    'share_capital' | 'opening_retained_earnings' | 'opening_cash_balance' | 'opening_balance_date'
  > | null | undefined
): JournalEntry[] {
  if (!settings) return []

  const shareCapital = round2(Number(settings.share_capital ?? 0))
  const openingRE = round2(Number(settings.opening_retained_earnings ?? 0))
  const openingCash = round2(Number(settings.opening_cash_balance ?? 0))
  if (shareCapital <= 0 && openingCash <= 0 && openingRE <= 0) return []

  const date = settings.opening_balance_date ?? '2000-01-01'
  const entries: JournalEntry[] = []

  if (openingCash > 0 || shareCapital > 0 || openingRE > 0) {
    const lines: JournalLine[] = []
    if (openingCash > 0) lines.push(jl('1010', openingCash, 0))
    if (shareCapital > 0) lines.push(jl('3000', 0, shareCapital))
    if (openingRE > 0) lines.push(jl('3100', 0, openingRE))
    const debits = round2(lines.reduce((s, l) => s + l.debit, 0))
    const credits = round2(lines.reduce((s, l) => s + l.credit, 0))
    const diff = round2(debits - credits)
    if (Math.abs(diff) > 0.01) {
      if (diff > 0) lines.push(jl('3100', 0, diff))
      else lines.push(jl('3100', Math.abs(diff), 0))
    }
    entries.push(
      entry(
        'opening-capital',
        date,
        'opening',
        'settings',
        'OUVERTURE',
        'Soldes d\'ouverture — trésorerie, capital et BNR',
        lines
      )
    )
  }

  return entries
}

export function filterEntriesByPeriod(entries: JournalEntry[], start: string, end: string): JournalEntry[] {
  if (!start && !end) return entries
  return entries.filter((e) => {
    if (start && e.date < start) return false
    if (end && e.date > end) return false
    return true
  })
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
        : account.type === 'contra'
          ? round2(credit - debit)
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
