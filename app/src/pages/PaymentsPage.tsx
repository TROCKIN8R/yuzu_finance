import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Invoice, Payment } from '../lib/types'
import { formatCad, formatDate, todayIso } from '../lib/format'
import { deriveInvoiceStatus, invoiceBalance } from '../lib/invoice'
import { deletePayment } from '../lib/invoiceActions'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

interface InvoiceWithPaid extends Invoice {
  paid: number
  balance: number
}

export function PaymentsPage() {
  const [invoices, setInvoices] = useState<InvoiceWithPaid[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    invoice_id: '',
    payment_date: todayIso(),
    amount: 0,
    method: 'virement',
    reference: '',
    notes: '',
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [inv, pay] = await Promise.all([
      supabase.from('invoices').select('*, clients(legal_name)').neq('status', 'void').order('invoice_date', { ascending: false }),
      supabase.from('payments').select('*, invoices(invoice_number, total)').order('payment_date', { ascending: false }),
    ])

    const paidMap: Record<string, number> = {}
    for (const p of pay.data ?? []) {
      paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount)
    }

    const enriched = (inv.data ?? []).map((i) => {
      const paid = paidMap[i.id] ?? 0
      return {
        ...(i as Invoice),
        paid,
        balance: invoiceBalance(Number(i.total), paid),
      }
    })
    setInvoices(enriched)
    setPayments((pay.data as Payment[]) ?? [])
  }

  function openRecord(inv?: InvoiceWithPaid) {
    setForm({
      invoice_id: inv?.id ?? invoices.find((i) => i.balance > 0)?.id ?? '',
      payment_date: todayIso(),
      amount: inv?.balance ?? 0,
      method: 'virement',
      reference: '',
      notes: '',
    })
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const inv = invoices.find((i) => i.id === form.invoice_id)
    if (!inv) return

    await supabase.from('payments').insert({
      invoice_id: form.invoice_id,
      payment_date: form.payment_date,
      amount: form.amount,
      method: form.method || null,
      reference: form.reference || null,
      notes: form.notes || null,
    })

    const newPaid = inv.paid + form.amount
    const status = deriveInvoiceStatus(Number(inv.total), newPaid, inv.status)
    await supabase.from('invoices').update({ status }).eq('id', inv.id)

    setOpen(false)
    load()
  }

  async function handleDeletePayment(p: Payment) {
    if (!confirm('Supprimer ce paiement ?')) return
    try {
      await deletePayment(p.id, p.invoice_id)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const outstanding = invoices.filter((i) => i.balance > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Paiements</h1>
        <Button onClick={() => openRecord()} disabled={outstanding.length === 0}>
          Enregistrer un paiement
        </Button>
      </div>

      <h2 className="text-sm font-medium text-muted mb-3">Réconciliation — factures ouvertes</h2>
      {outstanding.length === 0 ? (
        <EmptyState message="Aucun solde en attente." />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Facture</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payé</th>
                <th className="px-4 py-3 font-medium">Solde</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outstanding.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.clients?.legal_name}</td>
                  <td className="px-4 py-3">{formatCad(inv.total)}</td>
                  <td className="px-4 py-3 text-emerald-700">{formatCad(inv.paid)}</td>
                  <td className="px-4 py-3 font-medium">{formatCad(inv.balance)}</td>
                  <td className="px-4 py-3">
                    <Badge label={inv.status} tone={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openRecord(inv)}>
                      Payer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-medium text-muted mb-3">Historique des paiements</h2>
      {payments.length === 0 ? (
        <EmptyState message="Aucun paiement enregistré." />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Facture</th>
                <th className="px-4 py-3 font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">Méthode</th>
                <th className="px-4 py-3 font-medium">Référence</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 font-medium">{p.invoices?.invoice_number}</td>
                  <td className="px-4 py-3">{formatCad(p.amount)}</td>
                  <td className="px-4 py-3 text-muted">{p.method ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{p.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => handleDeletePayment(p)}>Suppr.</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Enregistrer un paiement" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Facture *">
            <select className={inputClass} required value={form.invoice_id} onChange={(e) => {
              const inv = invoices.find((i) => i.id === e.target.value)
              setForm({ ...form, invoice_id: e.target.value, amount: inv?.balance ?? 0 })
            }}>
              {outstanding.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — solde {formatCad(inv.balance)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input type="date" className={inputClass} required value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </Field>
            <Field label="Montant *">
              <input type="number" step="0.01" min="0.01" className={inputClass} required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Méthode">
            <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="virement">Virement</option>
              <option value="interac">Interac</option>
              <option value="cheque">Chèque</option>
              <option value="autre">Autre</option>
            </select>
          </Field>
          <Field label="Référence">
            <input className={inputClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
