import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client, Invoice, InvoiceStatus, OrganizationSettings, TimeEntry } from '../lib/types'
import { addDays, effectiveRate, formatCad, formatDate, lineAmount, todayIso } from '../lib/format'
import { computeInvoiceTotals } from '../lib/invoice'
import { deleteInvoice } from '../lib/invoiceActions'
import { downloadInvoicePdf } from '../lib/invoicePdf'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

export function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [linkedEntries, setLinkedEntries] = useState<TimeEntry[]>([])
  const [createClientId, setCreateClientId] = useState('')
  const [unbilled, setUnbilled] = useState<TimeEntry[]>([])
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [inv, cli, set] = await Promise.all([
      supabase.from('invoices').select('*, clients(legal_name)').order('invoice_date', { ascending: false }),
      supabase.from('clients').select('*').order('legal_name'),
      supabase.from('organization_settings').select('*').maybeSingle(),
    ])
    setRows((inv.data as Invoice[]) ?? [])
    setClients(cli.data ?? [])
    setSettings(set.data)
    if (cli.data?.[0]) setCreateClientId(cli.data[0].id)
  }

  async function loadUnbilled(clientId: string) {
    const { data: projects } = await supabase.from('projects').select('id').eq('client_id', clientId)
    const ids = (projects ?? []).map((p) => p.id)
    if (ids.length === 0) {
      setUnbilled([])
      return
    }
    const { data } = await supabase
      .from('time_entries')
      .select('*, projects(name, default_hourly_rate)')
      .in('project_id', ids)
      .is('invoice_id', null)
      .eq('billable', true)
      .order('entry_date')
    setUnbilled((data as TimeEntry[]) ?? [])
    setSelectedEntryIds(new Set((data ?? []).map((e) => e.id)))
  }

  async function openCreate() {
    setCreateOpen(true)
    if (createClientId) await loadUnbilled(createClientId)
  }

  async function viewDetail(inv: Invoice) {
    setSelected(inv)
    const { data } = await supabase
      .from('time_entries')
      .select('*, projects(name, default_hourly_rate)')
      .eq('invoice_id', inv.id)
      .order('entry_date')
    setLinkedEntries((data as TimeEntry[]) ?? [])
    setDetailOpen(true)
  }

  function previewSubtotal() {
    return unbilled
      .filter((e) => selectedEntryIds.has(e.id))
      .reduce((sum, e) => {
        const p = e.projects!
        return sum + lineAmount(Number(e.hours), effectiveRate(e, p))
      }, 0)
  }

  async function createInvoice() {
    if (!settings || selectedEntryIds.size === 0) return
    const client = clients.find((c) => c.id === createClientId)
    if (!client) return

    const { data: num, error: numErr } = await supabase.rpc('next_invoice_number')
    if (numErr || !num) {
      alert(numErr?.message ?? 'Numéro de facture indisponible')
      return
    }

    const subtotal = previewSubtotal()
    const totals = computeInvoiceTotals(subtotal, settings)
    const invoiceDate = todayIso()
    const dueDate = addDays(invoiceDate, client.payment_terms_days ?? settings.payment_terms_days)

    const { data: inv, error } = await supabase
      .from('invoices')
      .insert({
        client_id: createClientId,
        invoice_number: num,
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal: totals.subtotal,
        gst: totals.gst,
        qst: totals.qst,
        total: totals.total,
        status: 'draft',
      })
      .select()
      .single()

    if (error || !inv) {
      alert(error?.message ?? 'Erreur')
      return
    }

    await supabase
      .from('time_entries')
      .update({ invoice_id: inv.id })
      .in('id', [...selectedEntryIds])

    setCreateOpen(false)
    load()
  }

  async function updateStatus(id: string, status: InvoiceStatus) {
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
    if (selected?.id === id) setSelected({ ...selected, status })
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Supprimer la facture ${inv.invoice_number} ? Les entrées de temps seront libérées.`)) return
    try {
      await deleteInvoice(inv.id)
      setDetailOpen(false)
      setSelected(null)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  function handlePdf() {
    if (!selected || !settings) return
    const client = clients.find((c) => c.id === selected.client_id)
    if (!client) return
    downloadInvoicePdf({ invoice: selected, client, settings, entries: linkedEntries })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Factures</h1>
        <Button onClick={openCreate} disabled={clients.length === 0}>
          Créer depuis le temps
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune facture — créez-en une à partir du temps non facturé." />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">N°</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.clients?.legal_name}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3">{formatCad(inv.total)}</td>
                  <td className="px-4 py-3">
                    <Badge label={inv.status} tone={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => viewDetail(inv)}>
                      Voir
                    </Button>
                    <Button variant="danger" className="!px-2 !py-1" onClick={() => handleDelete(inv)}>
                      Suppr.
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Créer une facture" open={createOpen} onClose={() => setCreateOpen(false)} wide>
        <div className="space-y-4">
          <Field label="Client">
            <select
              className={inputClass}
              value={createClientId}
              onChange={async (e) => {
                setCreateClientId(e.target.value)
                await loadUnbilled(e.target.value)
              }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.legal_name}</option>
              ))}
            </select>
          </Field>
          {unbilled.length === 0 ? (
            <p className="text-sm text-muted">Aucun temps non facturé pour ce client.</p>
          ) : (
            <>
              <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                {unbilled.map((e) => {
                  const p = e.projects!
                  const amt = lineAmount(Number(e.hours), effectiveRate(e, p))
                  return (
                    <label key={e.id} className="flex items-start gap-3 px-3 py-2 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.has(e.id)}
                        onChange={(ev) => {
                          const next = new Set(selectedEntryIds)
                          if (ev.target.checked) next.add(e.id)
                          else next.delete(e.id)
                          setSelectedEntryIds(next)
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{e.description}</div>
                        <div className="text-muted text-xs">
                          {formatDate(e.entry_date)} · {p.name} · {Number(e.hours).toFixed(2)} h
                        </div>
                      </div>
                      <div className="text-sm font-medium">{formatCad(amt)}</div>
                    </label>
                  )
                })}
              </div>
              <div className="text-right text-sm">
                Sous-total sélectionné : <strong>{formatCad(previewSubtotal())}</strong>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setCreateOpen(false)}>Annuler</Button>
                <Button onClick={createInvoice} disabled={selectedEntryIds.size === 0}>
                  Créer la facture
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal title={selected?.invoice_number ?? 'Facture'} open={detailOpen} onClose={() => setDetailOpen(false)} wide>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-muted text-xs">Client</div>
                <div className="font-medium">{selected.clients?.legal_name}</div>
              </div>
              <div>
                <div className="text-muted text-xs">Échéance</div>
                <div>{formatDate(selected.due_date)}</div>
              </div>
            </div>
            <table className="w-full">
              <thead className="text-muted text-left border-b border-border">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Description</th>
                  <th className="py-2">Heures</th>
                </tr>
              </thead>
              <tbody>
                {linkedEntries.map((e) => (
                  <tr key={e.id} className="border-b border-border">
                    <td className="py-2">{formatDate(e.entry_date)}</td>
                    <td className="py-2">{e.description}</td>
                    <td className="py-2">{Number(e.hours).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right space-y-1">
              <div>Sous-total : {formatCad(selected.subtotal)}</div>
              <div>TPS : {formatCad(selected.gst)}</div>
              <div>TVQ : {formatCad(selected.qst)}</div>
              <div className="font-semibold text-lg">Total : {formatCad(selected.total)}</div>
            </div>
            <div className="flex gap-2 justify-between pt-2 flex-wrap">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handlePdf}>Télécharger PDF</Button>
                <Button variant="danger" onClick={() => handleDelete(selected)}>Supprimer</Button>
              </div>
              <div className="flex gap-2">
              {(['draft', 'sent', 'void'] as InvoiceStatus[]).map((s) => (
                <Button
                  key={s}
                  variant={selected.status === s ? 'primary' : 'secondary'}
                  className="!text-xs"
                  onClick={() => updateStatus(selected.id, s)}
                >
                  {s}
                </Button>
              ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
