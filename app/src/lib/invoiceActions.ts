import { deleteEntityDocuments } from './documents'
import { supabase } from './supabase'
import { assertPeriodOpenForDate } from './fiscalPeriodClose'
import { deriveInvoiceStatus } from './invoice'

export async function deleteInvoice(invoiceId: string, invoiceDate: string) {
  await assertPeriodOpenForDate(invoiceDate)
  await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
  await supabase.from('time_entries').update({ invoice_id: null }).eq('invoice_id', invoiceId)
  await supabase.from('projects').update({ invoice_id: null }).eq('invoice_id', invoiceId)
  await supabase.from('payments').delete().eq('invoice_id', invoiceId)
  await deleteEntityDocuments('invoice', invoiceId)
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
  if (error) throw error
}

export async function deletePayment(paymentId: string, invoiceId: string) {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  if (error) throw error
  await recalculateInvoiceStatus(invoiceId)
}

export async function recalculateInvoiceStatus(invoiceId: string) {
  const [{ data: inv }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('total, status').eq('id', invoiceId).single(),
    supabase.from('payments').select('amount').eq('invoice_id', invoiceId),
  ])
  if (!inv) return
  const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const status = deriveInvoiceStatus(Number(inv.total), paid, inv.status)
  await supabase.from('invoices').update({ status }).eq('id', invoiceId)
}
