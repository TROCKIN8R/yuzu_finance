import { useEffect, useMemo, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Partner, Invoice, InvoiceLineItem, InvoiceStatus, OrganizationSettings, Project, TimeEntry } from '../lib/types'
import { customerPartners, INVOICE_LANGUAGE_LABELS, resolvePartnerPaymentTerms } from '../lib/partners'
import { partnerInvoiceLanguage } from '../lib/invoiceI18n'
import {
  buildGroupedLinesFromTimeSheets,
  sheetBillableAmount,
  sheetSummary,
  totalLineHours,
  type TimeEntryWithLines,
} from '../lib/timeEntries'
import {
  buildLegacyLinesFromTimeEntries,
  buildLineFromFixedProject,
  sumInvoiceLines,
  type InvoiceLineDraft,
} from '../lib/invoice'
import { DEFAULT_CURRENCY, addDays, formatCad, formatDate, todayIso } from '../lib/format'
import { inDateRange, matchesSearch, countActiveFilters } from '../lib/filters'
import { effectiveTaxSettings } from '../lib/taxes'
import { deleteInvoice } from '../lib/invoiceActions'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'
import { downloadInvoicePdf, saveInvoicePdfToStorage } from '../lib/invoicePdf'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { DocumentAttachments } from '../components/DocumentAttachments'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import { DateRangeFilter, FilterSelect, ListToolbar } from '../components/ListToolbar'
import { PageHeader } from '../components/PageHeader'
import { StepActionBar } from '../components/WorkflowNav'
import { WorkflowFooter } from '../components/WorkflowFooter'
import { PageShell } from '../components/PageShell'

type BillingOutletContext = { refreshMetrics?: () => void }

function LineItemsTable({ lines, showTaxes }: { lines: (InvoiceLineItem | InvoiceLineDraft)[]; showTaxes: boolean }) {
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
            {showTaxes && (
              <>
                <th className="py-2 pr-2 text-right">TPS</th>
                <th className="py-2 pr-2 text-right">TVQ</th>
              </>
            )}
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
              {showTaxes && (
                <>
                  <td className="py-2 pr-2 text-right text-muted">{formatCad(line.gst)}</td>
                  <td className="py-2 pr-2 text-right text-muted">{formatCad(line.qst)}</td>
                </>
              )}
              <td className="py-2 text-right font-medium">{formatCad(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InvoicesPage() {
  const location = useLocation()
  const embedded = location.pathname.startsWith('/billing')
  const { refreshMetrics } = useOutletContext<BillingOutletContext>() ?? {}
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<Invoice[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)
  const [docVersion, setDocVersion] = useState(0)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [createPartnerId, setCreatePartnerId] = useState('')
  const [unbilled, setUnbilled] = useState<TimeEntryWithLines[]>([])
  const [unbilledFixed, setUnbilledFixed] = useState<Project[]>([])
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [includeSalesTax, setIncludeSalesTax] = useState(false)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const billablePartners = useMemo(() => customerPartners(partners), [partners])

  const filtered = useMemo(() => {
    return rows.filter((inv) => {
      if (partnerFilter && inv.partner_id !== partnerFilter) return false
      if (statusFilter && inv.status !== statusFilter) return false
      if (!inDateRange(inv.invoice_date, dateFrom, dateTo)) return false
      return matchesSearch(search, inv.invoice_number, inv.partners?.legal_name, inv.status, inv.total)
    })
  }, [rows, search, partnerFilter, statusFilter, dateFrom, dateTo])

  const hasFilters = !!(search || partnerFilter || statusFilter || dateFrom || dateTo)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [inv, cli, set] = await Promise.all([
      supabase.from('invoices').select('*, partners(legal_name)').order('invoice_date', { ascending: false }),
      supabase.from('partners').select('*').order('legal_name'),
      supabase.from('organization_settings').select('*').maybeSingle(),
    ])
    setRows((inv.data as Invoice[]) ?? [])
    setPartners(cli.data ?? [])
    setSettings(set.data)
    const billable = customerPartners(cli.data ?? [])
    if (billable[0]) setCreatePartnerId(billable[0].id)
    refreshMetrics?.()
  }

  async function loadUnbilled(partnerId: string) {
    const [{ data: projects }, { data: timeData }] = await Promise.all([
      supabase.from('projects').select('*').eq('partner_id', partnerId),
      supabase
        .from('projects')
        .select('id')
        .eq('partner_id', partnerId)
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
      .select('*, time_entry_lines(item_name, hours, billable, notes), projects(name, default_hourly_rate, billing_type)')
      .in('project_id', hourlyIds)
      .is('invoice_id', null)
      .eq('billable', true)
      .order('entry_date')
    const sheets = ((data as TimeEntryWithLines[]) ?? []).filter(
      (e) => (e.time_entry_lines ?? []).some((l) => l.billable && Number(l.hours) > 0) || Number(e.hours) > 0
    )
    setUnbilled(sheets)
    setSelectedEntryIds(new Set(sheets.map((e) => e.id)))
  }

  async function openCreate() {
    setIncludeSalesTax(false)
    setCreateOpen(true)
    if (createPartnerId) await loadUnbilled(createPartnerId)
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
    } else if (!settings) {
      setLineItems([])
    } else {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*, time_entry_lines(item_name, hours, billable), projects(name, default_hourly_rate, billing_type)')
        .eq('invoice_id', inv.id)
        .order('entry_date')
      const tax = effectiveTaxSettings(settings, inv.include_sales_tax ?? false)
      const withLines = entries ?? []
      const legacy =
        withLines.some((e) => (e.time_entry_lines ?? []).length > 0)
          ? buildGroupedLinesFromTimeSheets(withLines, tax)
          : buildLegacyLinesFromTimeEntries(withLines as TimeEntry[], tax)
      setLineItems(legacy as InvoiceLineItem[])
    }
    setDetailOpen(true)
  }

  function taxSettingsForCreate() {
    if (!settings) return null
    return effectiveTaxSettings(settings, includeSalesTax)
  }

  function previewLines() {
    const taxSettings = taxSettingsForCreate()
    if (!taxSettings) return []
    const selectedSheets = unbilled.filter((x) => selectedEntryIds.has(x.id))
    const hourlyLines = buildGroupedLinesFromTimeSheets(selectedSheets, taxSettings)
    const fixedLines = unbilledFixed
      .filter((x) => selectedProjectIds.has(x.id))
      .map((p, i) => buildLineFromFixedProject(p, taxSettings, hourlyLines.length + i))
    return [...hourlyLines, ...fixedLines]
  }

  function previewTotals() {
    return sumInvoiceLines(previewLines())
  }

  async function createInvoice() {
    if (!settings) return
    const lines = previewLines()
    if (lines.length === 0) return
    const partner = partners.find((p) => p.id === createPartnerId)
    if (!partner) return

    const { data: num, error: numErr } = await supabase.rpc('next_invoice_number')
    if (numErr || !num) {
      alert(numErr?.message ?? 'Numéro de facture indisponible')
      return
    }

    const totals = sumInvoiceLines(lines)
    const invoiceDate = todayIso()
    const entryDates = unbilled.filter((x) => selectedEntryIds.has(x.id)).map((x) => x.entry_date)
    if (blockIfClosed(invoiceDate, ...entryDates)) return
    const { days: paymentTermsDays } = resolvePartnerPaymentTerms(partner, settings)
    const dueDate = addDays(invoiceDate, paymentTermsDays)

    const { data: inv, error } = await supabase
      .from('invoices')
      .insert({
        partner_id: createPartnerId,
        invoice_number: num,
        invoice_date: invoiceDate,
        due_date: dueDate,
        currency: DEFAULT_CURRENCY,
        subtotal: totals.subtotal,
        gst: totals.gst,
        qst: totals.qst,
        total: totals.total,
        include_sales_tax: includeSalesTax,
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
    const inv = rows.find((r) => r.id === id) ?? selected
    if (inv && blockIfClosed(inv.invoice_date)) return
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
    if (selected?.id === id) setSelected({ ...selected, status })
  }

  async function handleDelete(inv: Invoice) {
    if (blockIfClosed(inv.invoice_date)) return
    if (!confirm(`Supprimer la facture ${inv.invoice_number} ? Les lignes et projets forfaitaires seront libérés.`)) return
    try {
      await deleteInvoice(inv.id, inv.invoice_date)
      setDetailOpen(false)
      setSelected(null)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handlePdf() {
    if (!selected || !settings) return
    const partner = partners.find((p) => p.id === selected.partner_id)
    if (!partner) return
    try {
      await downloadInvoicePdf({ invoice: selected, partner, settings, lines: lineItems })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la génération du PDF')
    }
  }

  async function handleSavePdf() {
    if (!selected || !settings) return
    const partner = partners.find((p) => p.id === selected.partner_id)
    if (!partner) return
    setSavingPdf(true)
    try {
      await saveInvoicePdfToStorage({ invoice: selected, partner, settings, lines: lineItems })
      setDocVersion((v) => v + 1)
      alert('PDF enregistré dans Supabase.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement du PDF')
    } finally {
      setSavingPdf(false)
    }
  }

  const preview = previewTotals()
  const canCreate = selectedEntryIds.size > 0 || selectedProjectIds.size > 0
  const nothingToBill = unbilled.length === 0 && unbilledFixed.length === 0
  const taxesEnabledInSettings = !!(settings?.charge_gst || settings?.charge_qst)
  const showTaxesOnInvoice = includeSalesTax && taxesEnabledInSettings

  const createInvoiceBtn = (
    <Button onClick={openCreate} disabled={billablePartners.length === 0}>
      Créer une facture
    </Button>
  )

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={createInvoiceBtn} />
      ) : (
        <PageHeader title="Factures" actions={createInvoiceBtn} />
      )}
      {rows.length === 0 ? (
        <EmptyState message="Aucune facture — créez-en une à partir du temps ou d'un projet forfaitaire." />
      ) : (
        <>
          <ListToolbar
            variant={embedded ? 'plain' : 'card'}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="N° facture, partenaire, montant…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, !!partnerFilter, !!statusFilter, !!dateFrom, !!dateTo)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setPartnerFilter('')
              setStatusFilter('')
              setDateFrom('')
              setDateTo('')
            }}
            trailing={embedded ? createInvoiceBtn : undefined}
          >
            <FilterSelect
              label="Partenaire"
              value={partnerFilter}
              onChange={setPartnerFilter}
              options={[{ value: '', label: 'Tous' }, ...billablePartners.map((p) => ({ value: p.id, label: p.legal_name }))]}
            />
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Tous' },
                { value: 'draft', label: 'Brouillon' },
                { value: 'sent', label: 'Envoyée' },
                { value: 'paid', label: 'Payée' },
                { value: 'partial', label: 'Partielle' },
                { value: 'void', label: 'Annulée' },
              ]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message="Aucune facture ne correspond aux filtres." />
          ) : (
            <DataTable>
              <thead className="bg-stone-50 text-muted text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">N°</th>
                  <th className="px-4 py-3 font-medium">Partenaire</th>
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
                    <td className="px-4 py-3">{inv.partners?.legal_name}</td>
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
          <Field label="Partenaire (client)">
            <select
              className={inputClass}
              value={createPartnerId}
              onChange={async (e) => {
                setCreatePartnerId(e.target.value)
                await loadUnbilled(e.target.value)
              }}
            >
              {billablePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.legal_name}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeSalesTax}
              onChange={(e) => setIncludeSalesTax(e.target.checked)}
            />
            <span>
              <span className="font-medium">Inclure TPS / TVQ sur cette facture</span>
              <span className="block text-xs text-muted mt-0.5">
                Désactivé par défaut — cochez seulement si vous êtes inscrit aux taxes de vente. Les taux et numéros
                d&apos;inscription se configurent dans Paramètres.
              </span>
            </span>
          </label>
          {includeSalesTax && !taxesEnabledInSettings && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Aucune taxe ne sera ajoutée tant que TPS/TVQ ne sont pas activées dans Paramètres.
            </p>
          )}

          {nothingToBill ? (
            <p className="text-sm text-muted">Aucun temps ni forfait non facturé pour ce partenaire.</p>
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
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Feuilles de temps (horaire)</p>
                  <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                    {unbilled.map((e) => {
                      const p = e.projects!
                      const hours =
                        (e.time_entry_lines ?? []).length > 0
                          ? totalLineHours(e.time_entry_lines ?? [])
                          : Number(e.hours)
                      const amt = sheetBillableAmount(e, p)
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
                            <div className="font-medium">{p.name}</div>
                            <div className="text-muted text-xs">
                              {formatDate(e.entry_date)} · {hours.toFixed(2)} h · {sheetSummary(e.time_entry_lines ?? [])}
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
                  <p className="text-xs font-medium text-muted uppercase tracking-wide">
                    Aperçu{showTaxesOnInvoice ? ' des taxes par ligne' : ''}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="text-left py-1">Description</th>
                          <th className="text-right py-1">Sous-total</th>
                          {showTaxesOnInvoice && (
                            <>
                              <th className="text-right py-1">TPS</th>
                              <th className="text-right py-1">TVQ</th>
                            </>
                          )}
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewLines().map((line, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1 pr-2">{line.description}</td>
                            <td className="py-1 text-right">{formatCad(line.subtotal)}</td>
                            {showTaxesOnInvoice && (
                              <>
                                <td className="py-1 text-right text-muted">{formatCad(line.gst)}</td>
                                <td className="py-1 text-right text-muted">{formatCad(line.qst)}</td>
                              </>
                            )}
                            <td className="py-1 text-right font-medium">{formatCad(line.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-right space-y-0.5 pt-2 border-t border-border">
                    <div>Sous-total : {formatCad(preview.subtotal)}</div>
                    {showTaxesOnInvoice && (
                      <>
                        <div>TPS : {formatCad(preview.gst)}</div>
                        <div>TVQ : {formatCad(preview.qst)}</div>
                      </>
                    )}
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
                <div className="text-muted text-xs">Partenaire</div>
                <div className="font-medium">{selected.partners?.legal_name}</div>
              </div>
              <div>
                <div className="text-muted text-xs">Échéance</div>
                <div>{formatDate(selected.due_date)}</div>
              </div>
              <div>
                <div className="text-muted text-xs">Devise</div>
                <div>{selected.currency || DEFAULT_CURRENCY}</div>
              </div>
              <div>
                <div className="text-muted text-xs">Langue PDF</div>
                <div>
                  {INVOICE_LANGUAGE_LABELS[partnerInvoiceLanguage(partners.find((p) => p.id === selected.partner_id)?.language)]}
                </div>
              </div>
            </div>

            <LineItemsTable
              lines={lineItems}
              showTaxes={
                (selected.include_sales_tax ?? false) &&
                (Number(selected.gst) > 0 || Number(selected.qst) > 0)
              }
            />

            <div className="text-right space-y-1 border-t border-border pt-3">
              <div>Sous-total : {formatCad(selected.subtotal)}</div>
              {(selected.include_sales_tax ?? false) &&
                (Number(selected.gst) > 0 || Number(selected.qst) > 0) && (
                <>
                  <div>TPS : {formatCad(selected.gst)}</div>
                  <div>TVQ : {formatCad(selected.qst)}</div>
                </>
              )}
              <div className="font-semibold text-lg">Total : {formatCad(selected.total)}</div>
            </div>

            <DocumentAttachments
              key={`${selected.id}-${docVersion}`}
              entityType="invoice"
              entityId={selected.id}
              label="Facture PDF / pièces jointes"
              hint="Enregistrez le PDF généré ou joignez une copie signée."
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between pt-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handlePdf}>
                  Télécharger PDF
                </Button>
                <Button variant="secondary" onClick={() => void handleSavePdf()} disabled={savingPdf}>
                  {savingPdf ? 'Enregistrement…' : 'Enregistrer PDF'}
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
      {embedded && (
        <WorkflowFooter to="/bank" label="Encaisser le paiement dans Banque">
          Facture envoyée ?
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
