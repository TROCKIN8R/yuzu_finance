import { addDays, todayIso } from './format'
import { supabase } from './supabase'
import type {
  ComplianceDeadline,
  ComplianceDeadlineCategory,
  ComplianceDeadlineStatus,
  CorporateTaxRecord,
  OrganizationSettings,
  SalesTaxPeriod,
} from './types'

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceDeadlineCategory, string> = {
  payroll_remittance: 'Retenues à la source',
  sales_tax: 'TPS / TVQ',
  corporate_tax: 'Impôt société',
  annual_return: 'Déclaration annuelle',
  insurance: 'Assurance',
  contract: 'Contrat',
  other: 'Autre',
}

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceDeadlineStatus, string> = {
  open: 'À faire',
  done: 'Fait',
  skipped: 'Ignoré',
}

type SeedRow = {
  title: string
  category: ComplianceDeadlineCategory
  due_date: string
  source_key: string
  notes?: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

function addMonths(y: number, m: number, d: number, months: number) {
  const dt = new Date(y, m - 1 + months, 1)
  const ny = dt.getFullYear()
  const nm = dt.getMonth() + 1
  const nd = Math.min(d, daysInMonth(ny, nm))
  return { y: ny, m: nm, d: nd }
}

/** Draft reminders for a Québec solo corp — confirm frequencies with CPA / portals. */
export function buildSeedDeadlines(
  settings: Pick<OrganizationSettings, 'fiscal_year_end_month' | 'fiscal_year_end_day' | 'charge_gst' | 'charge_qst'>,
  years: number[]
): SeedRow[] {
  const fyeMonth = settings.fiscal_year_end_month || 12
  const fyeDay = settings.fiscal_year_end_day || 31
  const salesTax = settings.charge_gst || settings.charge_qst
  const rows: SeedRow[] = []

  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const remittance = addMonths(year, month, 15, 1)
      rows.push({
        title: `Retenues paie (RP / TPZ) — ${pad(month)}/${year}`,
        category: 'payroll_remittance',
        due_date: iso(remittance.y, remittance.m, Math.min(15, remittance.d)),
        source_key: `seed:payroll:${year}-${pad(month)}`,
        notes: 'Échéance indicative (souvent le 15 du mois suivant). Confirmer au portail CRA / Revenu Québec.',
      })
    }

    if (salesTax) {
      const quarters: { endM: number; label: string }[] = [
        { endM: 3, label: 'T1' },
        { endM: 6, label: 'T2' },
        { endM: 9, label: 'T3' },
        { endM: 12, label: 'T4' },
      ]
      for (const q of quarters) {
        const dueMonth = addMonths(year, q.endM, 1, 1)
        rows.push({
          title: `TPS / TVQ ${q.label} ${year}`,
          category: 'sales_tax',
          due_date: iso(dueMonth.y, dueMonth.m, daysInMonth(dueMonth.y, dueMonth.m)),
          source_key: `seed:sales_tax:${year}-${q.label}`,
          notes: 'Rappel trimestriel indicatif — utiliser les dates de vos périodes TPS/TVQ si plus précises.',
        })
      }
    }

    const fyeEndDay = Math.min(fyeDay, daysInMonth(year, fyeMonth))
    const corpDue = addMonths(year, fyeMonth, fyeEndDay, 6)
    rows.push({
      title: `T2 / CO-17 — exercice se terminant ${iso(year, fyeMonth, fyeEndDay)}`,
      category: 'corporate_tax',
      due_date: iso(corpDue.y, corpDue.m, Math.min(corpDue.d, daysInMonth(corpDue.y, corpDue.m))),
      source_key: `seed:corp_tax:${year}-${pad(fyeMonth)}-${pad(fyeEndDay)}`,
      notes: 'Délai indicatif ~6 mois après la fin d’exercice. Brouillon pour révision CPA.',
    })

    rows.push({
      title: `Déclaration annuelle NEQ — ${year}`,
      category: 'annual_return',
      due_date: iso(year, 6, 15),
      source_key: `seed:neq:${year}`,
      notes: 'Date indicative — confirmer selon l’anniversaire d’immatriculation REQ.',
    })
  }

  return rows
}

export async function fetchComplianceDeadlines(): Promise<ComplianceDeadline[]> {
  const { data, error } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .order('due_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as ComplianceDeadline[]) ?? []
}

export async function fetchUpcomingDeadlines(opts?: {
  withinDays?: number
  limit?: number
  includeOverdue?: boolean
}): Promise<ComplianceDeadline[]> {
  const withinDays = opts?.withinDays ?? 90
  const limit = opts?.limit ?? 8
  const includeOverdue = opts?.includeOverdue ?? true
  const today = todayIso()
  const horizon = addDays(today, withinDays)

  const { data, error } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .eq('status', 'open')
    .lte('due_date', horizon)
    .order('due_date', { ascending: true })
    .limit(40)

  if (error) {
    if (error.message.includes('compliance_deadlines') || error.code === '42P01') {
      return []
    }
    throw new Error(error.message)
  }

  const rows = ((data as ComplianceDeadline[]) ?? []).filter((r) => {
    if (includeOverdue) return true
    return r.due_date >= today
  })
  return rows.slice(0, limit)
}

export async function seedComplianceCalendar(
  settings: Pick<OrganizationSettings, 'fiscal_year_end_month' | 'fiscal_year_end_day' | 'charge_gst' | 'charge_qst'>,
  years?: number[]
): Promise<number> {
  const y = new Date().getFullYear()
  const targetYears = years ?? [y, y + 1]
  const seeds = buildSeedDeadlines(settings, targetYears)

  let upserted = 0
  for (const seed of seeds) {
    const { data: existing } = await supabase
      .from('compliance_deadlines')
      .select('id, status')
      .eq('source_key', seed.source_key)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'open') {
        const { error } = await supabase
          .from('compliance_deadlines')
          .update({
            title: seed.title,
            category: seed.category,
            due_date: seed.due_date,
            notes: seed.notes ?? null,
          })
          .eq('id', existing.id)
        if (!error) upserted += 1
      }
      continue
    }

    const { error } = await supabase.from('compliance_deadlines').insert({
      title: seed.title,
      category: seed.category,
      due_date: seed.due_date,
      source: 'seed',
      source_key: seed.source_key,
      notes: seed.notes ?? null,
      status: 'open',
    })
    if (!error) upserted += 1
  }
  return upserted
}

/** Mirror filing due dates from sales tax periods and corporate tax records. */
export async function syncLinkedComplianceDeadlines(): Promise<number> {
  const [taxRes, corpRes] = await Promise.all([
    supabase.from('sales_tax_periods').select('id, period_start, period_end, filing_due_date, status, gst_net, qst_net'),
    supabase.from('corporate_tax_records').select('id, fiscal_year, label, due_date, status, amount, paid_amount'),
  ])

  let n = 0
  const taxRows = (taxRes.data as SalesTaxPeriod[] | null) ?? []
  for (const p of taxRows) {
    if (!p.filing_due_date) continue
    const sourceKey = `sales_tax:${p.id}`
    const done = p.status === 'filed' || p.status === 'paid'
    const payload = {
      title: `TPS / TVQ période ${p.period_start} → ${p.period_end}`,
      category: 'sales_tax' as const,
      due_date: p.filing_due_date,
      source: 'sales_tax' as const,
      source_key: sourceKey,
      amount: Number(p.gst_net ?? 0) + Number(p.qst_net ?? 0),
      status: (done ? 'done' : 'open') as ComplianceDeadlineStatus,
      completed_at: done ? new Date().toISOString() : null,
      notes: 'Synchronisé depuis la période TPS / TVQ.',
    }
    n += await upsertBySourceKey(sourceKey, payload)
  }

  const corpRows = (corpRes.data as CorporateTaxRecord[] | null) ?? []
  for (const r of corpRows) {
    if (!r.due_date) continue
    const sourceKey = `corporate_tax:${r.id}`
    const done = r.status === 'paid'
    const payload = {
      title: `${r.label} (${r.fiscal_year})`,
      category: 'corporate_tax' as const,
      due_date: r.due_date,
      source: 'corporate_tax' as const,
      source_key: sourceKey,
      amount: Math.max(0, Number(r.amount) - Number(r.paid_amount)),
      status: (done ? 'done' : 'open') as ComplianceDeadlineStatus,
      completed_at: done ? new Date().toISOString() : null,
      notes: 'Synchronisé depuis Impôts société.',
    }
    n += await upsertBySourceKey(sourceKey, payload)
  }
  return n
}

async function upsertBySourceKey(
  sourceKey: string,
  payload: {
    title: string
    category: ComplianceDeadlineCategory
    due_date: string
    source: 'sales_tax' | 'corporate_tax'
    source_key: string
    amount: number
    status: ComplianceDeadlineStatus
    completed_at: string | null
    notes: string
  }
): Promise<number> {
  const { data: existing } = await supabase
    .from('compliance_deadlines')
    .select('id, status')
    .eq('source_key', sourceKey)
    .maybeSingle()

  if (existing) {
    // Do not reopen manually completed linked items unless source says paid/done
    const nextStatus =
      payload.status === 'done' ? 'done' : existing.status === 'skipped' ? 'skipped' : payload.status
    const { error } = await supabase
      .from('compliance_deadlines')
      .update({
        title: payload.title,
        category: payload.category,
        due_date: payload.due_date,
        amount: payload.amount,
        status: nextStatus,
        completed_at: nextStatus === 'done' ? payload.completed_at ?? new Date().toISOString() : null,
        notes: payload.notes,
      })
      .eq('id', existing.id)
    return error ? 0 : 1
  }

  const { error } = await supabase.from('compliance_deadlines').insert(payload)
  return error ? 0 : 1
}

export function daysUntilDue(dueDate: string, today = todayIso()): number {
  const a = new Date(today + 'T12:00:00').getTime()
  const b = new Date(dueDate + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function urgencyTone(dueDate: string, today = todayIso()): 'overdue' | 'soon' | 'ok' {
  const d = daysUntilDue(dueDate, today)
  if (d < 0) return 'overdue'
  if (d <= 14) return 'soon'
  return 'ok'
}
