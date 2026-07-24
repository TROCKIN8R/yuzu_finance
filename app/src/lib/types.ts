export type RemittanceStatus = 'pending' | 'remitted'
export type AdjustmentType = 'prepaid' | 'accrual' | 'depreciation' | 'manual'
export type BankMatchSource =
  | 'payment'
  | 'expense'
  | 'payroll'
  | 'dividend'
  | 'sales_tax'
  | 'corporate_tax'
  | 'manual'

export type BankSourceFormat = 'chequing' | 'credit_card' | 'manual'

export interface BankTransaction {
  id: string
  user_id: string
  transaction_date: string
  description: string
  amount: number
  reconciled: boolean
  match_source: BankMatchSource | null
  match_id: string | null
  source_format: BankSourceFormat | null
  transaction_code: string | null
  import_key: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AccountingAdjustment {
  id: string
  user_id: string
  adjustment_type: AdjustmentType
  description: string
  start_date: string
  end_date: string | null
  total_amount: number | null
  monthly_amount: number | null
  debit_account: string
  credit_account: string
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
export type ExpenseCategory = 'software' | 'office' | 'travel' | 'professional' | 'marketing' | 'payroll' | 'other'
export type DocumentEntityType = 'invoice' | 'expense' | 'employee_expense'

export interface DocumentAttachment {
  id: string
  user_id: string
  entity_type: DocumentEntityType
  entity_id: string
  storage_path: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: string
  updated_at: string
}

export type TaxPeriodStatus = 'open' | 'filed' | 'paid'
export type CorpTaxStatus = 'estimated' | 'due' | 'paid'
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export interface Employee {
  id: string
  user_id: string
  first_name: string
  last_name: string
  email: string | null
  yearly_salary: number
  pay_frequency: PayFrequency
  estimated_yearly_income: number | null
  active: boolean
  hire_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DividendStatus = 'declared' | 'paid'

export interface Dividend {
  id: string
  user_id: string
  declared_date: string
  payment_date: string | null
  status: DividendStatus
  total_amount: number
  paid_amount: number
  employee_count: number
  amount_per_employee: number
  description: string | null
  notes: string | null
  created_at: string
  updated_at: string
  dividend_allocations?: DividendAllocation[]
}

export interface Shareholder {
  id: string
  user_id: string
  legal_name: string
  email: string | null
  employee_id: string | null
  shares_held: number
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  employees?: Pick<Employee, 'first_name' | 'last_name'>
}

export interface DividendAllocation {
  id: string
  user_id: string
  dividend_id: string
  employee_id: string | null
  shareholder_id: string | null
  amount: number
  created_at: string
  employees?: Pick<Employee, 'first_name' | 'last_name'>
  shareholders?: Pick<Shareholder, 'legal_name'>
}

export interface Expense {
  id: string
  user_id: string
  expense_date: string
  vendor: string
  category: ExpenseCategory
  description: string | null
  amount: number
  gst: number
  qst: number
  total: number
  paid: boolean
  payroll_run_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeExpense {
  id: string
  user_id: string
  employee_id: string
  expense_date: string
  vendor: string
  category: ExpenseCategory
  description: string | null
  amount: number
  gst: number
  qst: number
  total: number
  taxable: boolean
  payroll_run_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  employees?: Pick<Employee, 'first_name' | 'last_name'>
  payroll_runs?: Pick<PayrollRun, 'payment_date'>
}

export interface PayrollRun {
  id: string
  user_id: string
  employee_id: string | null
  pay_period_start: string
  pay_period_end: string
  payment_date: string
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  other_deductions: number
  net_pay: number
  reimbursement_total: number
  employer_benefits: number
  hsf_employer: number
  cnesst_employer: number
  notes: string | null
  remittance_status: RemittanceStatus
  remittance_date: string | null
  remittance_reference: string | null
  created_at: string
  updated_at: string
  employees?: Pick<Employee, 'first_name' | 'last_name'>
}

export interface SalesTaxPeriod {
  id: string
  user_id: string
  period_start: string
  period_end: string
  filing_due_date: string | null
  gst_collected: number
  qst_collected: number
  gst_itc: number
  qst_itr: number
  gst_net: number
  qst_net: number
  status: TaxPeriodStatus
  filed_date: string | null
  notes: string | null
  auto_synced_at?: string | null
  created_at: string
  updated_at: string
}

export interface CorporateTaxRecord {
  id: string
  user_id: string
  fiscal_year: string
  label: string
  tax_authority: string
  due_date: string | null
  amount: number
  paid_amount: number
  paid_date: string | null
  status: CorpTaxStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
export type BillingType = 'hourly' | 'fixed'
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void'

export type PartnerKind = 'customer' | 'provider' | 'both'

export type InvoiceLanguage = 'fr' | 'en'

export interface Partner {
  id: string
  user_id: string
  legal_name: string
  kind: PartnerKind
  contact_name: string | null
  email: string | null
  address_line1: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  language: InvoiceLanguage | null
  payment_terms_days: number
  invoice_penalty_monthly_pct: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  partner_id: string
  name: string
  status: ProjectStatus
  default_hourly_rate: number
  currency: string
  billing_type: BillingType
  fixed_price: number | null
  invoice_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  partners?: Pick<Partner, 'legal_name' | 'kind'>
}

export interface InvoiceLineItem {
  id: string
  user_id: string
  invoice_id: string
  project_id: string | null
  time_entry_id: string | null
  line_date: string | null
  description: string
  quantity: number
  unit_label: string
  unit_price: number
  subtotal: number
  gst: number
  qst: number
  total: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TimeEntryLine {
  id: string
  user_id: string
  time_entry_id: string
  item_name: string
  hours: number
  notes: string | null
  billable: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  project_id: string
  employee_id: string | null
  entry_date: string
  hours: number
  description: string | null
  notes: string | null
  billable: boolean
  rate_override: number | null
  invoice_id: string | null
  created_at: string
  updated_at: string
  projects?: Pick<
    Project,
    'id' | 'name' | 'default_hourly_rate' | 'billing_type' | 'fixed_price' | 'partner_id' | 'invoice_id' | 'status'
  > & {
    partners?: Pick<Partner, 'legal_name'>
  }
  employees?: Pick<Employee, 'first_name' | 'last_name'>
  invoices?: Pick<Invoice, 'invoice_number'>
  time_entry_lines?: TimeEntryLine[]
}

export interface Invoice {
  id: string
  user_id: string
  partner_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  currency: string
  subtotal: number
  gst: number
  qst: number
  total: number
  status: InvoiceStatus
  include_sales_tax: boolean
  notes: string | null
  created_at: string
  updated_at: string
  partners?: Pick<Partner, 'legal_name'>
}

export interface Payment {
  id: string
  user_id: string
  invoice_id: string
  payment_date: string
  amount: number
  method: string | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
  invoices?: Pick<Invoice, 'invoice_number' | 'total' | 'partner_id'>
}

export interface OrganizationSettings {
  user_id: string
  company_legal_name: string
  company_operating_name: string | null
  address_line1: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  neq: string | null
  gst_number: string | null
  qst_number: string | null
  email: string | null
  phone: string | null
  charge_gst: boolean
  charge_qst: boolean
  gst_rate: number
  qst_rate: number
  invoice_prefix: string
  payment_terms_days: number
  invoice_penalty_monthly_pct: number
  payment_instructions: string | null
  interac_email: string | null
  bank_institution: string | null
  bank_transit: string | null
  bank_account: string | null
  billing_inquiries_email: string | null
  payment_instructions_fr: string | null
  payment_instructions_en: string | null
  share_capital: number
  opening_retained_earnings: number
  opening_cash_balance: number
  opening_balance_date: string | null
  fiscal_year_end_month: number
  fiscal_year_end_day: number
  estimated_corp_tax_rate: number
  wip_accrual_enabled: boolean
  hsf_rate: number
  cnesst_rate: number
}

type OmitSystemFields<T> = Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: Partner
        Insert: OmitSystemFields<Partner> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<Partner>>
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: OmitSystemFields<Project> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<Project>>
        Relationships: []
      }
      time_entries: {
        Row: TimeEntry
        Insert: OmitSystemFields<TimeEntry> & { id?: string; user_id?: string; invoice_id?: string | null }
        Update: Partial<OmitSystemFields<TimeEntry>>
        Relationships: []
      }
      time_entry_lines: {
        Row: TimeEntryLine
        Insert: OmitSystemFields<TimeEntryLine> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<TimeEntryLine>>
        Relationships: []
      }
      invoices: {
        Row: Invoice
        Insert: OmitSystemFields<Invoice> & {
          id?: string
          user_id?: string
          currency?: string
          subtotal?: number
          gst?: number
          qst?: number
          total?: number
          status?: InvoiceStatus
        }
        Update: Partial<OmitSystemFields<Invoice>>
        Relationships: []
      }
      invoice_line_items: {
        Row: InvoiceLineItem
        Insert: OmitSystemFields<InvoiceLineItem> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<InvoiceLineItem>>
        Relationships: []
      }
      payments: {
        Row: Payment
        Insert: OmitSystemFields<Payment> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<Payment>>
        Relationships: []
      }
      organization_settings: {
        Row: OrganizationSettings
        Insert: Partial<OrganizationSettings> & { user_id: string }
        Update: Partial<OrganizationSettings>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      next_invoice_number: { Args: Record<string, never>; Returns: string }
    }
    Enums: {
      project_status: ProjectStatus
      invoice_status: InvoiceStatus
      partner_kind: PartnerKind
    }
    CompositeTypes: Record<string, never>
  }
}
