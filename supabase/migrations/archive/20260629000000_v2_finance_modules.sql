-- v2: expenses, payroll, sales tax, corporate tax

create type public.expense_category as enum (
  'software', 'office', 'travel', 'professional', 'marketing', 'payroll', 'other'
);

create type public.tax_period_status as enum ('open', 'filed', 'paid');
create type public.corp_tax_status as enum ('estimated', 'due', 'paid');

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
  payroll_run_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_id_idx on public.expenses (user_id);
create index expenses_date_idx on public.expenses (expense_date);

create trigger expenses_set_user_id before insert on public.expenses
  for each row execute function public.set_user_id();
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Payroll runs (owner-employee)
-- ---------------------------------------------------------------------------

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
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
  employer_benefits numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payroll_runs_user_id_idx on public.payroll_runs (user_id);

create trigger payroll_runs_set_user_id before insert on public.payroll_runs
  for each row execute function public.set_user_id();
create trigger payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function public.set_updated_at();

alter table public.expenses
  add constraint expenses_payroll_run_id_fkey
  foreign key (payroll_run_id) references public.payroll_runs (id) on delete set null;

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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_tax_periods_user_id_idx on public.sales_tax_periods (user_id);

create trigger sales_tax_periods_set_user_id before insert on public.sales_tax_periods
  for each row execute function public.set_user_id();
create trigger sales_tax_periods_updated_at before update on public.sales_tax_periods
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

create trigger corporate_tax_records_set_user_id before insert on public.corporate_tax_records
  for each row execute function public.set_user_id();
create trigger corporate_tax_records_updated_at before update on public.corporate_tax_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.expenses enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.sales_tax_periods enable row level security;
alter table public.corporate_tax_records enable row level security;

create policy "expenses_all_own" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payroll_runs_all_own" on public.payroll_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sales_tax_periods_all_own" on public.sales_tax_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "corporate_tax_records_all_own" on public.corporate_tax_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.expenses from anon, public;
revoke all on table public.payroll_runs from anon, public;
revoke all on table public.sales_tax_periods from anon, public;
revoke all on table public.corporate_tax_records from anon, public;

grant select, insert, update, delete on table public.expenses to authenticated;
grant select, insert, update, delete on table public.payroll_runs to authenticated;
grant select, insert, update, delete on table public.sales_tax_periods to authenticated;
grant select, insert, update, delete on table public.corporate_tax_records to authenticated;
