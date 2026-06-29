import { supabase } from './supabase'
import type { OrganizationSettings } from './types'
import type { MetricsProject, MetricsTimeEntry } from './billingMetrics'

export const TIME_ENTRY_SELECT =
  'entry_date, hours, rate_override, billable, invoice_id, project_id, projects(id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate, name, partners(legal_name))'

export const FIXED_PROJECT_SELECT =
  'id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate, name, partners(legal_name)'

export interface DashboardRawData {
  timeEntries: MetricsTimeEntry[]
  fixedProjects: MetricsProject[]
  partners: { id: string; legal_name: string }[]
}

export async function fetchDashboardBillingData(): Promise<DashboardRawData> {
  const [timeEntries, fixedProjects, partners] = await Promise.all([
    supabase.from('time_entries').select(TIME_ENTRY_SELECT),
    supabase.from('projects').select(FIXED_PROJECT_SELECT).eq('billing_type', 'fixed'),
    supabase.from('partners').select('id, legal_name').order('legal_name'),
  ])

  return {
    timeEntries: (timeEntries.data ?? []) as MetricsTimeEntry[],
    fixedProjects: (fixedProjects.data ?? []) as MetricsProject[],
    partners: partners.data ?? [],
  }
}

export async function fetchExecutiveExtras() {
  const [invoices, payments, lines] = await Promise.all([
    supabase.from('invoices').select('id, partner_id, subtotal, invoice_date, status').neq('status', 'void'),
    supabase.from('payments').select('amount, payment_date, invoice_id'),
    supabase.from('invoice_line_items').select('invoice_id, subtotal, unit_label'),
  ])

  return {
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    lines: lines.data ?? [],
  }
}

export async function fetchOrganizationSettings(): Promise<OrganizationSettings | null> {
  const { data } = await supabase.from('organization_settings').select('*').maybeSingle()
  return data ?? null
}
