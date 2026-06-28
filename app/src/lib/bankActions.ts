import { supabase } from './supabase'
import { deletePayment, recalculateInvoiceStatus } from './invoiceActions'
import type { ExpenseCategory } from './types'
import type { ParsedBankRow } from './wealthsimpleCsv'

export async function importBankRows(rows: ParsedBankRow[]) {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 }

  const { data: existing } = await supabase
    .from('bank_transactions')
    .select('import_key')
    .not('import_key', 'is', null)

  const existingKeys = new Set((existing ?? []).map((r) => r.import_key as string))
  const toInsert = rows
    .filter((r) => !existingKeys.has(r.import_key))
    .map((r) => ({
      transaction_date: r.transaction_date,
      description: r.description,
      amount: r.amount,
      transaction_code: r.transaction_code,
      source_format: r.source_format,
      import_key: r.import_key,
      reconciled: false,
      match_source: null,
      match_id: null,
    }))

  if (toInsert.length === 0) {
    return { inserted: 0, duplicates: rows.length }
  }

  const { error } = await supabase.from('bank_transactions').insert(toInsert)
  if (error) throw error

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

  if (payErr || !payment) throw payErr ?? new Error('Paiement non créé')

  await recalculateInvoiceStatus(invoiceId)

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'payment',
      match_id: payment.id,
    })
    .eq('id', bankId)

  if (bankErr) throw bankErr
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

  if (expErr || !expense) throw expErr ?? new Error('Dépense non créée')

  const { error: bankErr } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'expense',
      match_id: expense.id,
    })
    .eq('id', bankId)

  if (bankErr) throw bankErr
}

export async function ignoreBankTransaction(bankId: string) {
  const { error } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: true,
      match_source: 'manual',
      match_id: null,
    })
    .eq('id', bankId)
  if (error) throw error
}

export async function unassignBankTransaction(
  bankId: string,
  matchSource: string | null,
  matchId: string | null
) {
  if (matchSource === 'payment' && matchId) {
    const { data: payment } = await supabase.from('payments').select('invoice_id').eq('id', matchId).single()
    if (payment?.invoice_id) {
      await deletePayment(matchId, payment.invoice_id)
    }
  } else if (matchSource === 'expense' && matchId) {
    await supabase.from('expenses').delete().eq('id', matchId)
  }

  const { error } = await supabase
    .from('bank_transactions')
    .update({
      reconciled: false,
      match_source: null,
      match_id: null,
    })
    .eq('id', bankId)
  if (error) throw error
}

export async function deleteBankTransaction(bankId: string, matchSource: string | null, matchId: string | null) {
  if (matchSource === 'payment' && matchId) {
    const { data: payment } = await supabase.from('payments').select('invoice_id').eq('id', matchId).single()
    if (payment?.invoice_id) {
      await deletePayment(matchId, payment.invoice_id)
    }
  } else if (matchSource === 'expense' && matchId) {
    await supabase.from('expenses').delete().eq('id', matchId)
  }

  const { error } = await supabase.from('bank_transactions').delete().eq('id', bankId)
  if (error) throw error
}
