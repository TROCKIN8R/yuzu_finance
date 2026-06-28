import { supabase } from './supabase'
import { deletePayment, recalculateInvoiceStatus } from './invoiceActions'
import type { CorpTaxStatus, ExpenseCategory, TaxPeriodStatus } from './types'
import type { ParsedBankRow } from './wealthsimpleCsv'

async function loadExistingImportKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('import_key')
      .not('import_key', 'is', null)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      if (row.import_key) keys.add(row.import_key)
    }
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return keys
}

function parseRevertNote<T>(notes: string | null, prefix: string): T | null {
  if (!notes?.startsWith(prefix)) return null
  try {
    return JSON.parse(notes.slice(prefix.length)) as T
  } catch {
    return null
  }
}

async function revertLinkedRecord(bankId: string, matchSource: string | null, matchId: string | null) {
  if (!matchSource || !matchId) return

  const { data: bank } = await supabase.from('bank_transactions').select('notes').eq('id', bankId).single()
  const notes = bank?.notes ?? null

  if (matchSource === 'payment') {
    const { data: payment } = await supabase.from('payments').select('invoice_id').eq('id', matchId).single()
    if (payment?.invoice_id) await deletePayment(matchId, payment.invoice_id)
    return
  }

  if (matchSource === 'expense') {
    await supabase.from('expenses').delete().eq('id', matchId)
    return
  }

  if (matchSource === 'payroll') {
    if (notes === 'payroll_match:remittance') {
      await supabase
        .from('payroll_runs')
        .update({
          remittance_status: 'pending',
          remittance_date: null,
          remittance_reference: null,
        })
        .eq('id', matchId)
    }
    return
  }

  if (matchSource === 'sales_tax') {
    const prev = parseRevertNote<{ status: TaxPeriodStatus; filed_date: string | null }>(notes, 'sales_tax_prev:')
    if (prev) {
      await supabase
        .from('sales_tax_periods')
        .update({ status: prev.status, filed_date: prev.filed_date })
        .eq('id', matchId)
    }
    return
  }

  if (matchSource === 'corporate_tax') {
    const prev = parseRevertNote<{ status: CorpTaxStatus; paid_amount: number; paid_date: string | null }>(
      notes,
      'corp_tax_prev:'
    )
    if (prev) {
      await supabase
        .from('corporate_tax_records')
        .update({
          status: prev.status,
          paid_amount: prev.paid_amount,
          paid_date: prev.paid_date,
        })
        .eq('id', matchId)
    }
  }
}

export async function importBankRows(rows: ParsedBankRow[]) {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 }

  const existingKeys = await loadExistingImportKeys()
  const batchKeys = new Set<string>()
  const toInsert = []

  for (const r of rows) {
    if (existingKeys.has(r.import_key) || batchKeys.has(r.import_key)) continue
    batchKeys.add(r.import_key)
    toInsert.push({
      transaction_date: r.transaction_date,
      description: r.description,
      amount: r.amount,
      transaction_code: r.transaction_code,
      source_format: r.source_format,
      import_key: r.import_key,
      reconciled: false,
      match_source: null,
      match_id: null,
    })
  }

  if (toInsert.length === 0) {
    return { inserted: 0, duplicates: rows.length }
  }

  const { error } = await supabase.from('bank_transactions').insert(toInsert)
  if (error) throw new Error(error.message)

  return { inserted: toInsert.length, duplicates: rows.length - toInsert.length }
}

export async function assignBankPayment(
  bankId: string,
  invoiceId: string,
  paymentDate: string,
  amount: number,
  method: string | null,
  reference: string | null
) {
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      payment_date: paymentDate,
      amount,
      method,
      reference,
      notes: null,
    })
    .select('id')
    .single()

  if (payErr || !payment) throw new Error(payErr?.message ?? 'Paiement non créé')

  await recalculateInvoiceStatus(invoiceId)

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'payment',
      match_id: payment.id,
      notes: null,
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

export async function assignBankExpense(
  bankId: string,
  payload: {
    expense_date: string
    vendor: string
    category: ExpenseCategory
    description: string | null
    amount: number
    gst: number
    qst: number
    total: number
  }
) {
  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      ...payload,
      paid: true,
      notes: null,
    })
    .select('id')
    .single()

  if (expErr || !expense) throw new Error(expErr?.message ?? 'Dépense non créée')

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'expense',
      match_id: expense.id,
      notes: null,
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

export type PayrollBankMatchKind = 'net_pay' | 'remittance'

export async function assignBankPayroll(
  bankId: string,
  payrollRunId: string,
  kind: PayrollBankMatchKind,
  remittanceDate: string,
  remittanceReference: string | null
) {
  if (kind === 'remittance') {
    const { error: prErr } = await supabase
      .from('payroll_runs')
      .update({
        remittance_status: 'remitted',
        remittance_date: remittanceDate,
        remittance_reference: remittanceReference,
      })
      .eq('id', payrollRunId)
    if (prErr) throw new Error(prErr.message)
  }

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'payroll',
      match_id: payrollRunId,
      notes: kind === 'remittance' ? 'payroll_match:remittance' : 'payroll_match:net_pay',
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

export async function assignBankDividend(bankId: string, dividendId: string) {
  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'dividend',
      match_id: dividendId,
      notes: null,
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

export async function assignBankSalesTax(bankId: string, periodId: string, paymentDate: string) {
  const { data: period, error: readErr } = await supabase
    .from('sales_tax_periods')
    .select('status, filed_date')
    .eq('id', periodId)
    .single()

  if (readErr || !period) throw new Error(readErr?.message ?? 'Période TPS/TVQ introuvable')

  const prevNote = `sales_tax_prev:${JSON.stringify({
    status: period.status as TaxPeriodStatus,
    filed_date: period.filed_date,
  })}`

  const { error: periodErr } = await supabase
    .from('sales_tax_periods')
    .update({ status: 'paid', filed_date: paymentDate })
    .eq('id', periodId)

  if (periodErr) throw new Error(periodErr.message)

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'sales_tax',
      match_id: periodId,
      notes: prevNote,
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

export async function assignBankCorporateTax(
  bankId: string,
  recordId: string,
  paidAmount: number,
  paidDate: string
) {
  const { data: record, error: readErr } = await supabase
    .from('corporate_tax_records')
    .select('status, paid_amount, paid_date, amount')
    .eq('id', recordId)
    .single()

  if (readErr || !record) throw new Error(readErr?.message ?? 'Impôt société introuvable')

  const prevNote = `corp_tax_prev:${JSON.stringify({
    status: record.status as CorpTaxStatus,
    paid_amount: Number(record.paid_amount),
    paid_date: record.paid_date,
  })}`

  const newPaidTotal = round2(Number(record.paid_amount) + paidAmount)
  const status: CorpTaxStatus = newPaidTotal >= Number(record.amount) ? 'paid' : 'due'

  const { error: recordErr } = await supabase
    .from('corporate_tax_records')
    .update({
      paid_amount: newPaidTotal,
      paid_date: paidDate,
      status,
    })
    .eq('id', recordId)

  if (recordErr) throw new Error(recordErr.message)

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'corporate_tax',
      match_id: recordId,
      notes: prevNote,
    })
    .eq('id', bankId)

  if (bankErr) throw new Error(bankErr.message)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export async function ignoreBankTransaction(bankId: string) {
  const { error } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'manual',
      match_id: null,
      notes: null,
    })
    .eq('id', bankId)
  if (error) throw new Error(error.message)
}

export async function unassignBankTransaction(
  bankId: string,
  matchSource: string | null,
  matchId: string | null
) {
  await revertLinkedRecord(bankId, matchSource, matchId)

  const { error } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: false,
      match_source: null,
      match_id: null,
      notes: null,
    })
    .eq('id', bankId)
  if (error) throw new Error(error.message)
}

export async function deleteBankTransaction(bankId: string, matchSource: string | null, matchId: string | null) {
  await revertLinkedRecord(bankId, matchSource, matchId)

  const { error } = await supabase.from('bank_transactions').delete().eq('id', bankId)
  if (error) throw new Error(error.message)
}
