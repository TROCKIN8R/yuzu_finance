export type ExpenseCategory = 'software' | 'office' | 'travel' | 'professional' | 'marketing' | 'payroll' | 'other'
export type TaxPeriodStatus = 'open' | 'filed' | 'paid'
export type CorpTaxStatus = 'estimated' | 'due' | 'paid'

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

export interface PayrollRun {
  id: string
  user_id: string
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
  employer_benefits: number
  notes: string | null
  created_at: string
  updated_at: string
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
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void'

export interface Client {
  id: string
  user_id: string
  legal_name: string
  contact_name: string | null
  email: string | null
  address_line1: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  language: string | null
  payment_terms_days: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  client_id: string
  name: string
  status: ProjectStatus
  default_hourly_rate: number
  currency: string
  billing_type: string
  notes: string | null
  created_at: string
  updated_at: string
  clients?: Pick<Client, 'legal_name'>
}

export interface TimeEntry {
  id: string
  user_id: string
  project_id: string
  entry_date: string
  hours: number
  description: string
  billable: boolean
  rate_override: number | null
  invoice_id: string | null
  created_at: string
  updated_at: string
  projects?: Pick<Project, 'name' | 'default_hourly_rate' | 'client_id'> & {
    clients?: Pick<Client, 'legal_name'>
  }
  invoices?: Pick<Invoice, 'invoice_number'>
}

export interface Invoice {
  id: string
  user_id: string
  client_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: number
  gst: number
  qst: number
  total: number
  status: InvoiceStatus
  notes: string | null
  created_at: string
  updated_at: string
  clients?: Pick<Client, 'legal_name'>
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
  invoices?: Pick<Invoice, 'invoice_number' | 'total' | 'client_id'>
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
  payment_instructions: string | null
}

type OmitSystemFields<T> = Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: OmitSystemFields<Client> & { id?: string; user_id?: string }
        Update: Partial<OmitSystemFields<Client>>
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
      invoices: {
        Row: Invoice
        Insert: OmitSystemFields<Invoice> & {
          id?: string
          user_id?: string
          subtotal?: number
          gst?: number
          qst?: number
          total?: number
          status?: InvoiceStatus
        }
        Update: Partial<OmitSystemFields<Invoice>>
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
    }
    CompositeTypes: Record<string, never>
  }
}
