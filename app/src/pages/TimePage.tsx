import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Employee, Project } from '../lib/types'
import { formatCad, formatDate, relationOne, todayIso } from '../lib/format'
import { inDateRange, matchesSearch } from '../lib/filters'
import { billingTypeLabel } from '../lib/invoice'
import { isFixedProject } from '../lib/billingMetrics'
import { employeeDisplayName } from '../lib/payrollCalc'
import {
  entryHasBillableLines,
  fetchItemNameSuggestions,
  normalizeItemName,
  resolveItemName,
  sheetBillableAmount,
  sheetSummary,
  totalLineHours,
  type TimeEntryLineDraft,
  type TimeEntryWithLines,
} from '../lib/timeEntries'
import { Badge } from '../components/Badge'
import { Button, tableActionClass } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Field, inputClass } from '../components/Field'
import { EmptyState } from '../components/EmptyState'
import {
  FilterSummary,
  FilterTh,
  HeaderDateRange,
  HeaderSearch,
  HeaderSelect,
  PlainTh,
} from '../components/ColumnFilters'
import { PageHeader } from '../components/PageHeader'
import { StepActionBar } from '../components/WorkflowNav'
import { WorkflowFooter } from '../components/WorkflowFooter'
import { PageShell } from '../components/PageShell'
import { AlertBanner } from '../components/AlertBanner'
import { usePeriodCloseGuard } from '../contexts/PeriodCloseContext'

type Filter = 'all' | 'unbilled' | 'invoiced'
type BillingOutletContext = { refreshMetrics?: () => void }

const emptyLine = (): TimeEntryLineDraft => ({
  item_name: '',
  hours: 1,
  notes: '',
  billable: true,
})

const TIME_SELECT =
  '*, time_entry_lines(id, item_name, hours, notes, billable, sort_order), projects(name, default_hourly_rate, billing_type, fixed_price, partner_id, partners(legal_name)), employees(first_name, last_name), invoices(invoice_number)'

function ItemNameInput({
  value,
  onChange,
  suggestions,
  listId,
  required,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  listId: string
  required?: boolean
}) {
  return (
    <>
      <input
        className={inputClass}
        required={required}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex. Sprint planning, API work…"
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}

export function TimePage() {
  const location = useLocation()
  const embedded = location.pathname.startsWith('/billing')
  const { refreshMetrics } = useOutletContext<BillingOutletContext>() ?? {}
  const [rows, setRows] = useState<TimeEntryWithLines[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [billingFilter, setBillingFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [open, setOpen] = useState(false)
  const { blockIfClosed } = usePeriodCloseGuard()
  const [form, setForm] = useState({
    project_id: '',
    employee_id: '',
    entry_date: todayIso(),
    notes: '',
    rate_override: '',
    lines: [emptyLine()] as TimeEntryLineDraft[],
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([])
  const [loadingSheet, setLoadingSheet] = useState(false)

  const partnerOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of allProjects) {
      if (p.partners?.legal_name) names.set(p.partner_id, p.partners.legal_name)
    }
    return [...names.entries()].map(([id, label]) => ({ value: id, label }))
  }, [allProjects])

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      const proj = relationOne(t.projects)
      const lines = t.time_entry_lines ?? []
      const summary = sheetSummary(lines)
      const lineText = lines.map((l) => `${l.item_name} ${l.notes ?? ''}`).join(' ')
      if (billingFilter === 'unbilled' && t.invoice_id) return false
      if (billingFilter === 'invoiced' && !t.invoice_id) return false
      if (projectFilter && t.project_id !== projectFilter) return false
      if (partnerFilter && proj?.partner_id !== partnerFilter) return false
      if (!inDateRange(t.entry_date, dateFrom, dateTo)) return false
      const inv = relationOne(t.invoices)
      const emp = relationOne(t.employees)
      return matchesSearch(
        search,
        summary,
        lineText,
        t.notes,
        proj?.name,
        proj?.partners?.legal_name,
        inv?.invoice_number,
        emp ? employeeDisplayName(emp) : ''
      )
    })
  }, [rows, billingFilter, projectFilter, partnerFilter, dateFrom, dateTo, search])

  const hasFilters = !!(search || projectFilter || partnerFilter || dateFrom || dateTo || billingFilter !== 'all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [p, entries, emp] = await Promise.all([
      supabase.from('projects').select('*, partners(legal_name)').order('name'),
      supabase.from('time_entries').select(TIME_SELECT).order('entry_date', { ascending: false }),
      supabase.from('employees').select('*').eq('active', true).order('last_name').order('first_name'),
    ])
    setAllProjects((p.data as Project[]) ?? [])
    setProjects(((p.data as Project[]) ?? []).filter((x) => x.status === 'active'))
    setRows((entries.data as TimeEntryWithLines[]) ?? [])
    setEmployees((emp.data as Employee[]) ?? [])
    refreshMetrics?.()
  }

  const defaultEmployeeId = employees[0]?.id ?? ''

  async function loadSheetForProjectDate(projectId: string, entryDate: string, employeeId: string) {
    if (!projectId || !entryDate) return
    setLoadingSheet(true)
    let query = supabase
      .from('time_entries')
      .select(TIME_SELECT)
      .eq('project_id', projectId)
      .eq('entry_date', entryDate)
    query = employeeId ? query.eq('employee_id', employeeId) : query.is('employee_id', null)
    const { data } = await query.maybeSingle()
    const suggestions = await fetchItemNameSuggestions(projectId)
    setItemSuggestions(suggestions)

    if (data) {
      const sheet = data as TimeEntryWithLines
      setEditingId(sheet.id)
      setForm({
        project_id: sheet.project_id,
        employee_id: sheet.employee_id ?? employeeId,
        entry_date: sheet.entry_date,
        notes: sheet.notes ?? '',
        rate_override: sheet.rate_override != null ? String(sheet.rate_override) : '',
        lines:
          (sheet.time_entry_lines ?? []).length > 0
            ? (sheet.time_entry_lines ?? []).map((l) => ({
                id: l.id,
                item_name: l.item_name,
                hours: Number(l.hours),
                notes: l.notes ?? '',
                billable: l.billable,
              }))
            : [emptyLine()],
      })
    } else {
      setEditingId(null)
      setForm((prev) => ({
        ...prev,
        project_id: projectId,
        employee_id: employeeId,
        entry_date: entryDate,
        notes: '',
        rate_override: '',
        lines: [emptyLine()],
      }))
    }
    setLoadingSheet(false)
  }

  function openNew() {
    const projectId = projects[0]?.id ?? ''
    setForm({
      project_id: projectId,
      employee_id: defaultEmployeeId,
      entry_date: todayIso(),
      notes: '',
      rate_override: '',
      lines: [emptyLine()],
    })
    setEditingId(null)
    setOpen(true)
    if (projectId) void loadSheetForProjectDate(projectId, todayIso(), defaultEmployeeId)
  }

  function openEdit(t: TimeEntryWithLines) {
    if (t.invoice_id) {
      alert('Feuille déjà facturée — modification limitée.')
      return
    }
    setForm({
      project_id: t.project_id,
      employee_id: t.employee_id ?? defaultEmployeeId,
      entry_date: t.entry_date,
      notes: t.notes ?? '',
      rate_override: t.rate_override != null ? String(t.rate_override) : '',
      lines:
        (t.time_entry_lines ?? []).length > 0
          ? (t.time_entry_lines ?? []).map((l) => ({
              id: l.id,
              item_name: l.item_name,
              hours: Number(l.hours),
              notes: l.notes ?? '',
              billable: l.billable,
            }))
          : [emptyLine()],
    })
    setEditingId(t.id)
    setOpen(true)
    void fetchItemNameSuggestions(t.project_id).then(setItemSuggestions)
  }

  async function onProjectOrDateChange(projectId: string, entryDate: string, employeeId: string) {
    if (!open || tInvoiced()) return
    await loadSheetForProjectDate(projectId, entryDate, employeeId)
  }

  function tInvoiced() {
    if (!editingId) return false
    return rows.some((r) => r.id === editingId && r.invoice_id)
  }

  function updateLine(index: number, patch: Partial<TimeEntryLineDraft>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  function addLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }))
  }

  function removeLine(index: number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? [emptyLine()] : prev.lines.filter((_, i) => i !== index),
    }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.entry_date, form.entry_date)) return

    const project = projects.find((p) => p.id === form.project_id)
    const internalFixed = project ? isFixedProject(project) : false
    const cleanedLines = form.lines
      .map((line) => ({
        ...line,
        item_name: resolveItemName(line.item_name, itemSuggestions),
        notes: line.notes.trim(),
        billable: internalFixed ? false : line.billable,
      }))
      .filter((line) => normalizeItemName(line.item_name) && Number(line.hours) > 0)

    if (cleanedLines.length === 0) {
      alert('Ajoutez au moins une ligne avec un nom d\'item et des heures.')
      return
    }

    const totalHours = totalLineHours(cleanedLines)
    const headerPayload = {
      project_id: form.project_id,
      employee_id: form.employee_id || null,
      entry_date: form.entry_date,
      hours: totalHours,
      description: null,
      notes: form.notes.trim() || null,
      billable: entryHasBillableLines(cleanedLines),
      rate_override: form.rate_override ? Number(form.rate_override) : null,
    }

    let entryId = editingId
    if (entryId) {
      const { error } = await supabase.from('time_entries').update(headerPayload).eq('id', entryId)
      if (error) {
        alert(error.message)
        return
      }
      await supabase.from('time_entry_lines').delete().eq('time_entry_id', entryId)
    } else {
      const { data, error } = await supabase.from('time_entries').insert(headerPayload).select('id').single()
      if (error || !data) {
        alert(error?.message ?? 'Erreur — une feuille existe peut-être déjà pour ce projet et cette date.')
        return
      }
      entryId = data.id
    }

    const linePayload = cleanedLines.map((line, sort_order) => ({
      time_entry_id: entryId!,
      item_name: line.item_name,
      hours: line.hours,
      notes: line.notes || null,
      billable: line.billable,
      sort_order,
    }))
    const { error: lineErr } = await supabase.from('time_entry_lines').insert(linePayload)
    if (lineErr) {
      alert(lineErr.message)
      return
    }

    setOpen(false)
    load()
  }

  async function remove(t: TimeEntryWithLines) {
    if (t.invoice_id) {
      alert('Impossible de supprimer une feuille facturée.')
      return
    }
    if (!confirm('Supprimer cette feuille de temps ?')) return
    if (blockIfClosed(t.entry_date)) return
    await supabase.from('time_entries').delete().eq('id', t.id)
    load()
  }

  const unbilledCount = useMemo(
    () => rows.filter((t) => !t.invoice_id && entryHasBillableLines(t.time_entry_lines ?? [])).length,
    [rows]
  )

  const selectedProject = projects.find((p) => p.id === form.project_id)
  const fixedInternal = selectedProject ? isFixedProject(selectedProject) : false
  const formTotalHours = totalLineHours(form.lines)
  const datalistId = 'time-item-suggestions'

  const logTimeBtn = (
    <Button onClick={openNew} disabled={projects.length === 0 || employees.length === 0}>
      Logger du temps
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setProjectFilter('')
    setPartnerFilter('')
    setDateFrom('')
    setDateTo('')
    setBillingFilter('all')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={logTimeBtn} />
      ) : (
        <PageHeader
          title="Suivi du temps"
          subtitle="Une feuille par projet et par jour. Les notes quotidiennes restent internes ; la facture regroupe par item."
          actions={logTimeBtn}
        />
      )}
      {employees.length === 0 && (
        <AlertBanner>
          <Link to="/compensation/employees" className="font-medium underline">
            Ajoutez un employé
          </Link>{' '}
          avant de logger du temps.
        </AlertBanner>
      )}
      {rows.length === 0 ? (
        <EmptyState message="Aucune feuille de temps." />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? logTimeBtn : undefined}
          />
          <DataTable minWidth={960}>
            <thead className="bg-stone-50 text-left">
              <tr>
                <FilterTh label="Date">
                  <HeaderDateRange
                    from={dateFrom}
                    to={dateTo}
                    onFromChange={setDateFrom}
                    onToChange={setDateTo}
                  />
                </FilterTh>
                <FilterTh label="Projet">
                  <div className="flex flex-col gap-1 min-w-[8rem]">
                    <HeaderSelect
                      value={projectFilter}
                      onChange={setProjectFilter}
                      aria-label="Filtrer par projet"
                      options={[
                        { value: '', label: 'Tous les projets' },
                        ...allProjects.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                    <HeaderSelect
                      value={partnerFilter}
                      onChange={setPartnerFilter}
                      aria-label="Filtrer par partenaire"
                      options={[{ value: '', label: 'Tous les partenaires' }, ...partnerOptions]}
                    />
                  </div>
                </FilterTh>
                <FilterTh label="Items">
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Item, notes…"
                    aria-label="Filtrer par item"
                  />
                </FilterTh>
                <PlainTh>Heures</PlainTh>
                <PlainTh>Montant</PlainTh>
                <FilterTh label="Facturation">
                  <HeaderSelect
                    value={billingFilter}
                    onChange={(v) => setBillingFilter(v as Filter)}
                    aria-label="Filtrer par facturation"
                    options={[
                      { value: 'all', label: 'Tout' },
                      { value: 'unbilled', label: 'Non facturé' },
                      { value: 'invoiced', label: 'Facturé' },
                    ]}
                  />
                </FilterTh>
                <PlainTh className="w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted">
                    Aucune feuille ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const proj = relationOne(t.projects)
                  const internal = proj ? isFixedProject(proj as Project) : false
                  const lines = t.time_entry_lines ?? []
                  const hours = lines.length > 0 ? totalLineHours(lines) : Number(t.hours)
                  const amt = internal ? 0 : sheetBillableAmount(t, proj ?? undefined)
                  const inv = relationOne(t.invoices)
                  return (
                    <tr key={t.id} className="hover:bg-stone-50/50">
                      <td className="px-3 py-3">{formatDate(t.entry_date)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{proj?.name ?? '—'}</div>
                        <div className="text-xs text-muted">{proj?.partners?.legal_name}</div>
                      </td>
                      <td className="px-3 py-3 text-muted max-w-md truncate">{sheetSummary(lines)}</td>
                      <td className="px-3 py-3">{hours.toFixed(2)}</td>
                      <td className="px-3 py-3">{internal ? '—' : amt > 0 ? formatCad(amt) : '—'}</td>
                      <td className="px-3 py-3">
                        {internal ? (
                          <Badge label="Interne" tone="sent" />
                        ) : t.invoice_id ? (
                          <Badge label={inv?.invoice_number ?? 'Facturé'} tone="invoiced" />
                        ) : (
                          <Badge label="Non facturé" tone="unbilled" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-right space-x-2">
                        <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(t)}>
                          Modifier
                        </Button>
                        <Button variant="danger" className={tableActionClass} onClick={() => remove(t)}>
                          Suppr.
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </DataTable>
        </>
      )}

      <Modal
        title={editingId ? 'Modifier la feuille' : 'Feuille de temps'}
        open={open}
        onClose={() => setOpen(false)}
        wide
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Employé *">
              <select
                className={inputClass}
                required
                value={form.employee_id}
                onChange={(e) => {
                  const employeeId = e.target.value
                  setForm({ ...form, employee_id: employeeId })
                  void onProjectOrDateChange(form.project_id, form.entry_date, employeeId)
                }}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeDisplayName(e)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Projet *">
              <select
                className={inputClass}
                required
                value={form.project_id}
                onChange={(e) => {
                  const projectId = e.target.value
                  setForm({ ...form, project_id: projectId })
                  void onProjectOrDateChange(projectId, form.entry_date, form.employee_id)
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {billingTypeLabel(p.billing_type)} ({p.partners?.legal_name})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date *">
              <input
                type="date"
                className={inputClass}
                required
                value={form.entry_date}
                onChange={(e) => {
                  const entryDate = e.target.value
                  setForm({ ...form, entry_date: entryDate })
                  void onProjectOrDateChange(form.project_id, entryDate, form.employee_id)
                }}
              />
            </Field>
          </div>

          {fixedInternal && (
            <p className="text-xs text-muted">
              Projet forfaitaire — suivi interne uniquement, non visible sur la facture client.
            </p>
          )}

          {loadingSheet ? (
            <p className="text-sm text-muted">Chargement de la feuille…</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-stone-50 px-4 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Items du jour</p>
                <span className="text-xs text-muted">Total : {formTotalHours.toFixed(2)} h</span>
              </div>
              <div className="divide-y divide-border">
                {form.lines.map((line, index) => (
                  <div key={index} className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      <Field label="Item *" className="sm:col-span-5">
                        <ItemNameInput
                          value={line.item_name}
                          onChange={(value) => updateLine(index, { item_name: value })}
                          suggestions={itemSuggestions}
                          listId={datalistId}
                          required
                        />
                      </Field>
                      <Field label="Heures *" className="sm:col-span-2">
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          className={inputClass}
                          required
                          value={line.hours}
                          onChange={(e) => updateLine(index, { hours: Number(e.target.value) })}
                        />
                      </Field>
                      {!fixedInternal && (
                        <Field label="Facturable" className="sm:col-span-2">
                          <select
                            className={inputClass}
                            value={line.billable ? 'yes' : 'no'}
                            onChange={(e) => updateLine(index, { billable: e.target.value === 'yes' })}
                          >
                            <option value="yes">Oui</option>
                            <option value="no">Non</option>
                          </select>
                        </Field>
                      )}
                      <div className="sm:col-span-3 flex justify-end pt-6">
                        <Button type="button" variant="ghost" className={tableActionClass} onClick={() => removeLine(index)}>
                          Retirer
                        </Button>
                      </div>
                    </div>
                    <Field label="Notes du jour (interne)">
                      <input
                        className={inputClass}
                        value={line.notes}
                        onChange={(e) => updateLine(index, { notes: e.target.value })}
                        placeholder="Détails sur ce que vous avez fait…"
                      />
                    </Field>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-border">
                <Button type="button" variant="secondary" onClick={addLine}>
                  + Ajouter un item
                </Button>
              </div>
            </div>
          )}

          <Field label="Notes de la feuille (interne, optionnel)">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Contexte général de la journée…"
            />
          </Field>

          {!fixedInternal && (
            <Field label="Taux override (optionnel, toute la feuille)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                placeholder="Taux projet par défaut"
                value={form.rate_override}
                onChange={(e) => setForm({ ...form, rate_override: e.target.value })}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loadingSheet}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      {embedded && unbilledCount > 0 && (
        <WorkflowFooter to="/billing/invoices" label="Créer une facture">
          {unbilledCount} feuille{unbilledCount > 1 ? 's' : ''} prête{unbilledCount > 1 ? 's' : ''} à facturer.
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
