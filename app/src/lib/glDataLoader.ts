import { supabase } from './supabase'
import type { GeneralLedgerBuildInput } from './financials'
import type { MetricsProject } from './billingMetrics'
import { TIME_ENTRY_SELECT } from './dashboardData'
import { entriesToMetrics } from './timeEntries'

export async function fetchGeneralLedgerData(): Promise<{
  data: GeneralLedgerBuildInput
  warnings: string[]
}> {
  const [
    invoices,
    payments,
    expenses,
    employeeExpenses,
    payroll,
    dividends,
    corpTax,
    salesTax,
    adjustments,
    settingsRow,
    timeEntries,
    fixedProjects,
  ] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number, invoice_date, subtotal, gst, qst, total, status'),
    supabase.from('payments').select('id, payment_date, amount, invoice_id, reference, invoices(invoice_number, status)'),
    supabase.from('expenses').select('id, expense_date, vendor, category, description, amount, gst, qst, total, paid, payroll_run_id'),
    supabase.from('employee_expenses').select('id, expense_date, vendor, category, description, amount, gst, qst, total, taxable, payroll_run_id'),
    supabase
      .from('payroll_runs')
      .select(
        'id, payment_date, remittance_status, remittance_date, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, hsf_employer, cnesst_employer, net_pay, reimbursement_total'
      ),
    supabase.from('dividends').select('id, declared_date, payment_date, total_amount, paid_amount, description, status'),
    supabase
      .from('corporate_tax_records')
      .select('id, paid_date, paid_amount, amount, status, due_date, label, fiscal_year'),
    supabase.from('sales_tax_periods').select('id, period_end, filed_date, gst_net, qst_net, status'),
    supabase.from('accounting_adjustments').select('*'),
    supabase
      .from('organization_settings')
      .select(
        'share_capital, opening_retained_earnings, opening_cash_balance, opening_balance_date, estimated_corp_tax_rate, wip_accrual_enabled, hsf_rate, cnesst_rate'
      )
      .maybeSingle(),
    supabase.from('time_entries').select(TIME_ENTRY_SELECT),
    supabase
      .from('projects')
      .select('id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate')
      .eq('billing_type', 'fixed'),
  ])

  const warnings: string[] = []
  if (adjustments.error) {
    warnings.push(
      adjustments.error.message.includes('accounting_adjustments')
        ? 'Ajustements manuels non chargés — exécutez la migration 20260630150100_accounting_adjustments.sql.'
        : `Ajustements non chargés : ${adjustments.error.message}`
    )
  }
  if (settingsRow.error) {
    warnings.push(`Paramètres comptables non chargés : ${settingsRow.error.message}`)
  }
  if (timeEntries.error) {
    warnings.push(`Temps non chargé pour WIP : ${timeEntries.error.message}`)
  }

  return {
    data: {
      invoices: invoices.data ?? [],
      payments: payments.data ?? [],
      expenses: expenses.data ?? [],
      employeeExpenses: employeeExpenses.data ?? [],
      payrollRuns: payroll.data ?? [],
      dividends: dividends.data ?? [],
      corporateTax: corpTax.data ?? [],
      salesTaxRemittances: salesTax.data ?? [],
      adjustments: adjustments.data ?? [],
      settings: settingsRow.data,
      timeEntries: entriesToMetrics(timeEntries.data ?? []),
      fixedProjects: (fixedProjects.data ?? []) as MetricsProject[],
    },
    warnings,
  }
}

export async function fetchFinancialReportExtras() {
  const [bank, salesTaxPaid] = await Promise.all([
    supabase.from('bank_transactions').select('amount, transaction_date'),
    supabase.from('sales_tax_periods').select('gst_net, qst_net, filed_date, period_end, status').eq('status', 'paid'),
  ])
  return {
    bankTransactions: bank.data ?? [],
    salesTaxRemitted: salesTaxPaid.data ?? [],
  }
}
