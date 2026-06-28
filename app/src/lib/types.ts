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

export interface Database {
  public: {
    Tables: {
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> }
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> }
      time_entries: { Row: TimeEntry; Insert: Partial<TimeEntry>; Update: Partial<TimeEntry> }
      invoices: { Row: Invoice; Insert: Partial<Invoice>; Update: Partial<Invoice> }
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> }
      organization_settings: {
        Row: OrganizationSettings
        Insert: Partial<OrganizationSettings>
        Update: Partial<OrganizationSettings>
      }
    }
    Functions: {
      next_invoice_number: { Args: Record<string, never>; Returns: string }
    }
  }
}
