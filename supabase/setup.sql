-- =============================================================================
-- Yuzu Finance — full database setup (fresh Supabase project)
-- =============================================================================
-- Run once in Supabase → SQL Editor on an empty project.
-- Do NOT re-run on a database that already has these tables (use migrations/archive/ for upgrades).
--
-- After running:
--   1. Create your user account (Authentication → Users, or sign in via the app once).
--   2. Disable new sign-ups (Authentication → Settings).
--   3. Optionally update organization_settings (see commented example at bottom).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'void');
create type public.expense_category as enum (
  'software', 'office', 'travel', 'professional', 'marketing', 'payroll', 'other'
);
create type public.tax_period_status as enum ('open', 'filed', 'paid');
create type public.corp_tax_status as enum ('estimated', 'due', 'paid');
create type public.pay_frequency as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');
create type public.partner_kind as enum ('customer', 'provider', 'both');

-- ---------------------------------------------------------------------------
-- Organization settings (one row per authenticated user)
-- ---------------------------------------------------------------------------

create table public.organization_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_legal_name text not null default '',
  company_operating_name text default '',
  address_line1 text,
  city text,
  province text default 'QC',
  postal_code text,
  country text default 'Canada',
  neq text,
  gst_number text,
  qst_number text,
  email text,
  phone text,
  charge_gst boolean not null default false,
  charge_qst boolean not null default false,
  gst_rate numeric(6, 5) not null default 0.05,
  qst_rate numeric(6, 5) not null default 0.09975,
  invoice_prefix text not null default 'YUZU',
  payment_terms_days integer not null default 30,
  payment_instructions text,
  share_capital numeric(12, 2) not null default 0,
  opening_retained_earnings numeric(12, 2) not null default 0,
  opening_cash_balance numeric(12, 2) not null default 0,
  fiscal_year_end_month integer not null default 6 check (fiscal_year_end_month between 1 and 12),
  fiscal_year_end_day integer not null default 30 check (fiscal_year_end_day between 1 and 31),
  estimated_corp_tax_rate numeric(6, 5) not null default 0.12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Partners (clients, suppliers, or both)
-- ---------------------------------------------------------------------------

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legal_name text not null,
  kind public.partner_kind not null default 'customer',
  contact_name text,
  email text,
  address_line1 text,
  city text,
  province text default 'QC',
  postal_code text,
  country text default 'Canada',
  language text default 'fr',
  payment_terms_days integer default 30,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_user_id_idx on public.partners (user_id);

create trigger partners_set_user_id
  before insert on public.partners
  for each row execute function public.set_user_id();

create trigger partners_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  name text not null,
  status public.project_status not null default 'active',
  default_hourly_rate numeric(10, 2) not null,
  currency text not null default 'CAD',
  billing_type text not null default 'hourly' check (billing_type in ('hourly', 'fixed')),
  fixed_price numeric(10, 2) check (fixed_price is null or fixed_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_partner_id_idx on public.projects (partner_id);

create trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  yearly_salary numeric(12, 2) not null check (yearly_salary >= 0),
  pay_frequency public.pay_frequency not null default 'biweekly',
  estimated_yearly_income numeric(12, 2) check (estimated_yearly_income is null or estimated_yearly_income >= 0),
  active boolean not null default true,
  hire_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_user_id_idx on public.employees (user_id);
create index employees_active_idx on public.employees (user_id, active);

create trigger employees_set_user_id
  before insert on public.employees
  for each row execute function public.set_user_id();

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  employee_id uuid references public.employees (id) on delete restrict,
  entry_date date not null,
  hours numeric(6, 2) not null check (hours > 0),
  description text not null,
  billable boolean not null default true,
  rate_override numeric(10, 2),
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_entries_user_id_idx on public.time_entries (user_id);
create index time_entries_project_id_idx on public.time_entries (project_id);
create index time_entries_employee_id_idx on public.time_entries (employee_id);
create index time_entries_invoice_id_idx on public.time_entries (invoice_id);

create trigger time_entries_set_user_id
  before insert on public.time_entries
  for each row execute function public.set_user_id();

create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  qst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  include_sales_tax boolean not null default false,
  status public.invoice_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create index invoices_user_id_idx on public.invoices (user_id);
create index invoices_partner_id_idx on public.invoices (partner_id);

create trigger invoices_set_user_id
  before insert on public.invoices
  for each row execute function public.set_user_id();

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.time_entries
  add constraint time_entries_invoice_id_fkey
  foreign key (invoice_id) references public.invoices (id) on delete set null;

alter table public.projects
  add column invoice_id uuid references public.invoices (id) on delete set null;

create index projects_invoice_id_idx on public.projects (invoice_id);

-- ---------------------------------------------------------------------------
-- Invoice line items (per-row taxes)
-- ---------------------------------------------------------------------------

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  time_entry_id uuid references public.time_entries (id) on delete set null,
  line_date date,
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_label text not null default 'forfait',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  gst numeric(12, 2) not null default 0 check (gst >= 0),
  qst numeric(12, 2) not null default 0 check (qst >= 0),
  total numeric(12, 2) not null check (total >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_line_items_user_id_idx on public.invoice_line_items (user_id);
create index invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);

create trigger invoice_line_items_set_user_id
  before insert on public.invoice_line_items
  for each row execute function public.set_user_id();

create trigger invoice_line_items_updated_at
  before update on public.invoice_line_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_invoice_id_idx on public.payments (invoice_id);

create trigger payments_set_user_id
  before insert on public.payments
  for each row execute function public.set_user_id();

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Payroll runs
-- ---------------------------------------------------------------------------

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete restrict,
  pay_period_start date not null,
  pay_period_end date not null,
  payment_date date not null default current_date,
  gross_pay numeric(12, 2) not null,
  federal_tax numeric(12, 2) not null default 0,
  provincial_tax numeric(12, 2) not null default 0,
  cpp_employee numeric(12, 2) not null default 0,
  ei_employee numeric(12, 2) not null default 0,
  qpip_employee numeric(12, 2) not null default 0,
  cpp_employer numeric(12, 2) not null default 0,
  ei_employer numeric(12, 2) not null default 0,
  qpip_employer numeric(12, 2) not null default 0,
  other_deductions numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null,
  reimbursement_total numeric(12, 2) not null default 0,
  employer_benefits numeric(12, 2) not null default 0,
  remittance_status text not null default 'pending'
    check (remittance_status in ('pending', 'remitted')),
  remittance_date date,
  remittance_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payroll_runs_user_id_idx on public.payroll_runs (user_id);
create index payroll_runs_employee_id_idx on public.payroll_runs (employee_id);

create trigger payroll_runs_set_user_id
  before insert on public.payroll_runs
  for each row execute function public.set_user_id();

create trigger payroll_runs_updated_at
  before update on public.payroll_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expense_date date not null default current_date,
  vendor text not null,
  category public.expense_category not null default 'other',
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  gst numeric(12, 2) not null default 0,
  qst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  paid boolean not null default true,
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_id_idx on public.expenses (user_id);
create index expenses_date_idx on public.expenses (expense_date);

create trigger expenses_set_user_id
  before insert on public.expenses
  for each row execute function public.set_user_id();

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Employee expenses (out-of-pocket, reimbursed via payroll)
-- ---------------------------------------------------------------------------

create table public.employee_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  expense_date date not null default current_date,
  vendor text not null,
  category public.expense_category not null default 'other',
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  gst numeric(12, 2) not null default 0,
  qst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  taxable boolean not null default false,
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employee_expenses_user_id_idx on public.employee_expenses (user_id);
create index employee_expenses_employee_id_idx on public.employee_expenses (employee_id);
create index employee_expenses_unreimbursed_idx on public.employee_expenses (user_id, employee_id)
  where payroll_run_id is null;

create trigger employee_expenses_set_user_id
  before insert on public.employee_expenses
  for each row execute function public.set_user_id();

create trigger employee_expenses_updated_at
  before update on public.employee_expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sales tax periods (GST / QST)
-- ---------------------------------------------------------------------------

create table public.sales_tax_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  filing_due_date date,
  gst_collected numeric(12, 2) not null default 0,
  qst_collected numeric(12, 2) not null default 0,
  gst_itc numeric(12, 2) not null default 0,
  qst_itr numeric(12, 2) not null default 0,
  gst_net numeric(12, 2) not null default 0,
  qst_net numeric(12, 2) not null default 0,
  status public.tax_period_status not null default 'open',
  filed_date date,
  auto_synced_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_tax_periods_user_id_idx on public.sales_tax_periods (user_id);

create trigger sales_tax_periods_set_user_id
  before insert on public.sales_tax_periods
  for each row execute function public.set_user_id();

create trigger sales_tax_periods_updated_at
  before update on public.sales_tax_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Corporate / income tax
-- ---------------------------------------------------------------------------

create table public.corporate_tax_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fiscal_year text not null,
  label text not null,
  tax_authority text not null default 'CRA',
  due_date date,
  amount numeric(12, 2) not null,
  paid_amount numeric(12, 2) not null default 0,
  paid_date date,
  status public.corp_tax_status not null default 'estimated',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index corporate_tax_records_user_id_idx on public.corporate_tax_records (user_id);

create trigger corporate_tax_records_set_user_id
  before insert on public.corporate_tax_records
  for each row execute function public.set_user_id();

create trigger corporate_tax_records_updated_at
  before update on public.corporate_tax_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Dividends (split equally among active employees at creation)
-- ---------------------------------------------------------------------------

create table public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  declared_date date not null default current_date,
  payment_date date,
  status text not null default 'declared' check (status in ('declared', 'paid')),
  total_amount numeric(12, 2) not null check (total_amount > 0),
  employee_count integer not null check (employee_count > 0),
  amount_per_employee numeric(12, 2) not null check (amount_per_employee >= 0),
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dividend_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dividend_id uuid not null references public.dividends (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (dividend_id, employee_id)
);

create index dividends_user_id_idx on public.dividends (user_id);
create index dividend_allocations_dividend_id_idx on public.dividend_allocations (dividend_id);

create trigger dividends_set_user_id
  before insert on public.dividends
  for each row execute function public.set_user_id();

create or replace function public.dividends_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.declared_date is null then
    new.declared_date := coalesce(new.payment_date, current_date);
  end if;
  if new.status is null then
    new.status := 'declared';
  end if;
  return new;
end;
$$;

create trigger dividends_before_insert
  before insert on public.dividends
  for each row execute function public.dividends_before_insert();

create trigger dividends_updated_at
  before update on public.dividends
  for each row execute function public.set_updated_at();

create trigger dividend_allocations_set_user_id
  before insert on public.dividend_allocations
  for each row execute function public.set_user_id();

-- ---------------------------------------------------------------------------
-- Bank reconciliation
-- ---------------------------------------------------------------------------

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_date date not null,
  description text not null,
  amount numeric(12, 2) not null,
  reconciled boolean not null default false,
  match_source text check (match_source is null or match_source in (
    'payment', 'expense', 'payroll', 'dividend', 'sales_tax', 'corporate_tax', 'manual'
  )),
  match_id uuid,
  source_format text check (
    source_format is null or source_format in ('chequing', 'credit_card', 'manual')
  ),
  transaction_code text,
  import_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_transactions_user_id_idx on public.bank_transactions (user_id);
create index bank_transactions_date_idx on public.bank_transactions (transaction_date);
create unique index bank_transactions_user_import_key_idx
  on public.bank_transactions (user_id, import_key)
  where import_key is not null;

create trigger bank_transactions_set_user_id
  before insert on public.bank_transactions
  for each row execute function public.set_user_id();

create trigger bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accounting adjustments (prepaids, accruals, depreciation, manual)
-- ---------------------------------------------------------------------------

create table public.accounting_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('prepaid', 'accrual', 'depreciation', 'manual')),
  description text not null,
  start_date date not null,
  end_date date,
  total_amount numeric(12, 2),
  monthly_amount numeric(12, 2),
  debit_account text not null,
  credit_account text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounting_adjustments_user_id_idx on public.accounting_adjustments (user_id);

create trigger accounting_adjustments_set_user_id
  before insert on public.accounting_adjustments
  for each row execute function public.set_user_id();

create trigger accounting_adjustments_updated_at
  before update on public.accounting_adjustments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — only the owning user can access their rows
-- ---------------------------------------------------------------------------

alter table public.organization_settings enable row level security;
alter table public.partners enable row level security;
alter table public.projects enable row level security;
alter table public.employees enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.expenses enable row level security;
alter table public.employee_expenses enable row level security;
alter table public.sales_tax_periods enable row level security;
alter table public.corporate_tax_records enable row level security;
alter table public.dividends enable row level security;
alter table public.dividend_allocations enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.accounting_adjustments enable row level security;

create policy "settings_select_own" on public.organization_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.organization_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.organization_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "partners_all_own" on public.partners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "employees_all_own" on public.employees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "time_entries_all_own" on public.time_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoices_all_own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoice_line_items_all_own" on public.invoice_line_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "payments_all_own" on public.payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "payroll_runs_all_own" on public.payroll_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "expenses_all_own" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "employee_expenses_all_own" on public.employee_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sales_tax_periods_all_own" on public.sales_tax_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "corporate_tax_records_all_own" on public.corporate_tax_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dividends_all_own" on public.dividends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dividend_allocations_all_own" on public.dividend_allocations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bank_transactions_all_own" on public.bank_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "accounting_adjustments_all_own" on public.accounting_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants — authenticated only; block anonymous table access
-- ---------------------------------------------------------------------------

revoke all on table public.organization_settings from anon, public;
revoke all on table public.partners from anon, public;
revoke all on table public.projects from anon, public;
revoke all on table public.employees from anon, public;
revoke all on table public.time_entries from anon, public;
revoke all on table public.invoices from anon, public;
revoke all on table public.invoice_line_items from anon, public;
revoke all on table public.payments from anon, public;
revoke all on table public.payroll_runs from anon, public;
revoke all on table public.expenses from anon, public;
revoke all on table public.employee_expenses from anon, public;
revoke all on table public.sales_tax_periods from anon, public;
revoke all on table public.corporate_tax_records from anon, public;
revoke all on table public.dividends from anon, public;
revoke all on table public.dividend_allocations from anon, public;
revoke all on table public.bank_transactions from anon, public;
revoke all on table public.accounting_adjustments from anon, public;

grant select, insert, update, delete on table public.organization_settings to authenticated;
grant select, insert, update, delete on table public.partners to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.time_entries to authenticated;
grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.invoice_line_items to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant select, insert, update, delete on table public.payroll_runs to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;
grant select, insert, update, delete on table public.employee_expenses to authenticated;
grant select, insert, update, delete on table public.sales_tax_periods to authenticated;
grant select, insert, update, delete on table public.corporate_tax_records to authenticated;
grant select, insert, update, delete on table public.dividends to authenticated;
grant select, insert, update, delete on table public.dividend_allocations to authenticated;
grant select, insert, update, delete on table public.bank_transactions to authenticated;
grant select, insert, update, delete on table public.accounting_adjustments to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create settings row on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Invoice number helper (callable from client via RPC)
-- ---------------------------------------------------------------------------

create or replace function public.next_invoice_number()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  prefix text;
  year_part text;
  seq integer;
begin
  select coalesce(s.invoice_prefix, 'YUZU') into prefix
  from public.organization_settings s
  where s.user_id = auth.uid();

  if prefix is null then
    prefix := 'YUZU';
  end if;

  year_part := to_char(current_date, 'YYYY');

  select coalesce(max(
    nullif(regexp_replace(invoice_number, '^.*-', ''), '')::integer
  ), 0) into seq
  from public.invoices
  where user_id = auth.uid()
    and invoice_number like prefix || '-' || year_part || '-%';

  return prefix || '-' || year_part || '-' || lpad((seq + 1)::text, 4, '0');
end;
$$;

grant execute on function public.next_invoice_number() to authenticated;

-- ---------------------------------------------------------------------------
-- Optional: seed organization_settings after first login
-- Replace USER_UUID with your auth.users.id from Supabase dashboard.
-- Do not put real NEQ, addresses, or names in this public repo.
-- ---------------------------------------------------------------------------
--
-- update public.organization_settings set
--   company_legal_name = 'Your Company Inc.',
--   company_operating_name = '',
--   address_line1 = '',
--   city = '',
--   province = 'QC',
--   postal_code = '',
--   neq = '',
--   payment_terms_days = 30,
--   payment_instructions = ''
-- where user_id = 'USER_UUID';
