import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client, Invoice, InvoiceLineItem, InvoiceStatus, OrganizationSettings, Project, TimeEntry } from '../lib/types'
import { addDays, effectiveRate, formatCad, formatDate, lineAmount, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import {
  buildLegacyLinesFromTimeEntries,
  buildLineFromFixedProject,
  buildLineFromTimeEntry,
  sumInvoiceLines,
} from '../lib/invoice'
import { deleteInvoice } from '../lib/invoiceActions'
import { downloadInvoicePdf } from '../lib/invoicePdf'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { ClearFiltersButton, DateRangeFilter, FilterSelect, ListToolbar } from '../components/ListToolbar'

function LineItemsTable({ lines }: { lines: (InvoiceLineItem | ReturnType<typeof buildLineFromTimeEntry>)[] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-muted text-left border-b border-border">
          <tr>
            <th className="py-2 pr-2">Date</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">Qté</th>
            <th className="py-2 pr-2 text-right">Prix unit.</th>
            <th className="py-2 pr-2 text-right">Sous-total</th>
            <th className="py-2 pr-2 text-right">TPS</th>
            <th className="py-2 pr-2 text-right">TVQ</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={'id' in line ? line.id : i} className="border-b border-border">
              <td className="py-2 pr-2 text-muted">{line.line_date ? formatDate(line.line_date) : '—'}</td>
              <td className="py-2 pr-2">{line.description}</td>
              <td className="py-2 pr-2 text-right text-muted">
                {line.unit_label === 'h' ? `${Number(line.quantity).toFixed(2)} h` : '1'}
              </td>
              <td className="py-2 pr-2 text-right text-muted">
                {line.unit_label === 'h' ? `${formatCad(line.unit_price)}/h` : formatCad(line.unit_price)}
              </td>
              <td className="py-2 pr-2 text-right">{formatCad(line.subtotal)}</td>
              <td className="py-2 pr-2 text-right text-muted">{formatCad(line.gst)}</td>
              <td className="py-2 pr-2 text-right text-muted">{formatCad(line.qst)}</td>
              <td className="py-2 text-right font-medium">{formatCad(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [createClientId, setCreateClientId] = useState('')
  const [unbilled, setUnbilled] = useState<TimeEntry[]>([])
  const [unbilledFixed, setUnbilledFixed] = useState<Project[]>([])
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((inv) => {
      if (clientFilter && inv.client_id !== clientFilter) return false
      if (statusFilter && inv.status !== statusFilter) return false
      if (!inDateRange(inv.invoice_date, dateFrom, dateTo)) return false
      return matchesSearch(search, inv.invoice_number, inv.clients?.legal_name, inv.status, inv.total)
    })
  }, [rows, search, clientFilter, statusFilter, dateFrom, dateTo])

  const hasFilters = !!(search || clientFilter || statusFilter || dateFrom || dateTo)

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
    const [{ data: projects }, { data: timeData }] = await Promise.all([
      supabase.from('projects').select('*').eq('client_id', clientId),
      supabase
        .from('projects')
        .select('id')
        .eq('client_id', clientId)
        .eq('billing_type', 'hourly'),
    ])
    const hourlyIds = (timeData ?? []).map((p) => p.id)
    const fixed = ((projects as Project[]) ?? []).filter(
      (p) => p.billing_type === 'fixed' && !p.invoice_id && p.status !== 'archived'
    )
    setUnbilledFixed(fixed)
    setSelectedProjectIds(new Set(fixed.map((p) => p.id)))

    if (hourlyIds.length === 0) {
      setUnbilled([])
      setSelectedEntryIds(new Set())
      return
    }
    const { data } = await supabase
      .from('time_entries')
      .select('*, projects(name, default_hourly_rate, billing_type)')
      .in('project_id', hourlyIds)
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
    const { data: lines } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('sort_order')
    if (lines && lines.length > 0) {
      setLineItems(lines as InvoiceLineItem[])
    } else {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*, projects(name, default_hourly_rate, billing_type)')
        .eq('invoice_id', inv.id)
        .order('entry_date')
      const legacy = settings ? buildLegacyLinesFromTimeEntries((entries as TimeEntry[]) ?? [], settings) : []
      setLineItems(legacy as InvoiceLineItem[])
    }
    setDetailOpen(true)
  }

  function previewLines() {
    if (!settings) return []
    let order = 0
    const lines = []
    for (const e of unbilled.filter((x) => selectedEntryIds.has(x.id))) {
      lines.push(buildLineFromTimeEntry(e, settings, order++))
    }
    for (const p of unbilledFixed.filter((x) => selectedProjectIds.has(x.id))) {
      lines.push(buildLineFromFixedProject(p, settings, order++))
    }
    return lines
  }

  function previewTotals() {
    return sumInvoiceLines(previewLines())
  }

  async function createInvoice() {
    if (!settings) return
    const lines = previewLines()
    if (lines.length === 0) return
    const client = clients.find((c) => c.id === createClientId)
    if (!client) return

    const { data: num, error: numErr } = await supabase.rpc('next_invoice_number')
    if (numErr || !num) {
      alert(numErr?.message ?? 'Numéro de facture indisponible')
      return
    }

    const totals = sumInvoiceLines(lines)
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

    const { error: lineErr } = await supabase.from('invoice_line_items').insert(
      lines.map((line) => ({
        invoice_id: inv.id,
        project_id: line.project_id,
        time_entry_id: line.time_entry_id,
        line_date: line.line_date,
        description: line.description,
        quantity: line.quantity,
        unit_label: line.unit_label,
        unit_price: line.unit_price,
        subtotal: line.subtotal,
        gst: line.gst,
        qst: line.qst,
        total: line.total,
        sort_order: line.sort_order,
      }))
    )
    if (lineErr) {
      alert(lineErr.message)
      await supabase.from('invoices').delete().eq('id', inv.id)
      return
    }

    const entryIds = [...selectedEntryIds]
    if (entryIds.length > 0) {
      await supabase.from('time_entries').update({ invoice_id: inv.id }).in('id', entryIds)
    }
    const projectIds = [...selectedProjectIds]
    if (projectIds.length > 0) {
      await supabase.from('projects').update({ invoice_id: inv.id }).in('id', projectIds)
    }

    setCreateOpen(false)
    load()
  }

  async function updateStatus(id: string, status: InvoiceStatus) {
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
    if (selected?.id === id) setSelected({ ...selected, status })
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Supprimer la facture ${inv.invoice_number} ? Les lignes et projets forfaitaires seront libérés.`)) return
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
    downloadInvoicePdf({ invoice: selected, client, settings, lines: lineItems })
  }

  const preview = previewTotals()
  const canCreate = selectedEntryIds.size > 0 || selectedProjectIds.size > 0
  const nothingToBill = unbilled.length === 0 && unbilledFixed.length === 0

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold">Factures</h1>
        <Button onClick={openCreate} disabled={clients.length === 0}>
          Créer une facture
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Aucune facture — créez-en une à partir du temps ou d'un projet forfaitaire." />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="N° facture, client, montant…"
            resultCount={filtered.length}
            totalCount={rows.length}
          >
            <FilterSelect
              label="Client"
              value={clientFilter}
              onChange={setClientFilter}
              options={[{ value: '', label: 'Tous' }, ...clients.map((c) => ({ value: c.id, label: c.legal_name }))]}
            />
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'draft', label: 'draft' },
                { value: 'sent', label: 'sent' },
                { value: 'paid', label: 'paid' },
                { value: 'partial', label: 'partial' },
                { value: 'void', label: 'void' },
              ]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            <ClearFiltersButton
              visible={hasFilters}
              onClick={() => {
                setSearch('')
                setClientFilter('')
                setStatusFilter('')
                setDateFrom('')
                setDateTo('')
              }}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune facture ne correspond aux filtres." />
          ) : (
            <DataTable>
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
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{inv.clients?.legal_name}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3">{formatCad(inv.total)}</td>
                    <td className="px-4 py-3">
                      <Badge label={inv.status} tone={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" className={tableActionClass} onClick={() => viewDetail(inv)}>
                        Voir
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => handleDelete(inv)}>
                        Suppr.
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
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
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </select>
          </Field>

          {nothingToBill ? (
            <p className="text-sm text-muted">Aucun temps ni forfait non facturé pour ce client.</p>
          ) : (
            <>
              {unbilledFixed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Projets forfaitaires</p>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {unbilledFixed.map((p) => (
                      <label key={p.id} className="flex items-start gap-3 px-3 py-2 hover:bg-stone-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.has(p.id)}
                          onChange={(ev) => {
                            const next = new Set(selectedProjectIds)
                            if (ev.target.checked) next.add(p.id)
                            else next.delete(p.id)
                            setSelectedProjectIds(next)
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-muted text-xs">Forfait</div>
                        </div>
                        <div className="text-sm font-medium">{formatCad(Number(p.fixed_price ?? 0))}</div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {unbilled.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Temps (horaire)</p>
                  <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
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
                </div>
              )}

              {canCreate && settings && (
                <div className="bg-stone-50 rounded-lg p-3 text-sm space-y-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide">Aperçu des taxes par ligne</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="text-left py-1">Description</th>
                          <th className="text-right py-1">Sous-total</th>
                          <th className="text-right py-1">TPS</th>
                          <th className="text-right py-1">TVQ</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewLines().map((line, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1 pr-2">{line.description}</td>
                            <td className="py-1 text-right">{formatCad(line.subtotal)}</td>
                            <td className="py-1 text-right text-muted">{formatCad(line.gst)}</td>
                            <td className="py-1 text-right text-muted">{formatCad(line.qst)}</td>
                            <td className="py-1 text-right font-medium">{formatCad(line.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-right space-y-0.5 pt-2 border-t border-border">
                    <div>Sous-total : {formatCad(preview.subtotal)}</div>
                    <div>TPS : {formatCad(preview.gst)}</div>
                    <div>TVQ : {formatCad(preview.qst)}</div>
                    <div className="font-semibold">Total : {formatCad(preview.total)}</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={createInvoice} disabled={!canCreate}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-muted text-xs">Client</div>
                <div className="font-medium">{selected.clients?.legal_name}</div>
              </div>
              <div>
                <div className="text-muted text-xs">Échéance</div>
                <div>{formatDate(selected.due_date)}</div>
              </div>
            </div>

            <LineItemsTable lines={lineItems} />

            <div className="text-right space-y-1 border-t border-border pt-3">
              <div>Sous-total : {formatCad(selected.subtotal)}</div>
              <div>TPS : {formatCad(selected.gst)}</div>
              <div>TVQ : {formatCad(selected.qst)}</div>
              <div className="font-semibold text-lg">Total : {formatCad(selected.total)}</div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between pt-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handlePdf}>
                  Télécharger PDF
                </Button>
                <Button variant="danger" onClick={() => handleDelete(selected)}>
                  Supprimer
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
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
