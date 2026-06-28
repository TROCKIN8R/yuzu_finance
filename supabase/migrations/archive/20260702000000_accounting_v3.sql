-- Accounting v3: settings extensions, bank rec, adjustments, payroll remittances

alter table public.organization_settings
  add column if not exists share_capital numeric(12, 2) not null default 0,
  add column if not exists opening_retained_earnings numeric(12, 2) not null default 0,
  add column if not exists opening_cash_balance numeric(12, 2) not null default 0,
  add column if not exists fiscal_year_end_month integer not null default 6 check (fiscal_year_end_month between 1 and 12),
  add column if not exists fiscal_year_end_day integer not null default 30 check (fiscal_year_end_day between 1 and 31),
  add column if not exists estimated_corp_tax_rate numeric(6, 5) not null default 0.12;

alter table public.payroll_runs
  add column if not exists remittance_status text not null default 'pending'
    check (remittance_status in ('pending', 'remitted')),
  add column if not exists remittance_date date,
  add column if not exists remittance_reference text;

create table if not exists public.bank_transactions (
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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_transactions_user_id_idx on public.bank_transactions (user_id);
create index if not exists bank_transactions_date_idx on public.bank_transactions (transaction_date);

drop trigger if exists bank_transactions_set_user_id on public.bank_transactions;
create trigger bank_transactions_set_user_id
  before insert on public.bank_transactions
  for each row execute function public.set_user_id();

drop trigger if exists bank_transactions_updated_at on public.bank_transactions;
create trigger bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

create table if not exists public.accounting_adjustments (
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

create index if not exists accounting_adjustments_user_id_idx on public.accounting_adjustments (user_id);

drop trigger if exists accounting_adjustments_set_user_id on public.accounting_adjustments;
create trigger accounting_adjustments_set_user_id
  before insert on public.accounting_adjustments
  for each row execute function public.set_user_id();

drop trigger if exists accounting_adjustments_updated_at on public.accounting_adjustments;
create trigger accounting_adjustments_updated_at
  before update on public.accounting_adjustments
  for each row execute function public.set_updated_at();

alter table public.bank_transactions enable row level security;
alter table public.accounting_adjustments enable row level security;

drop policy if exists "bank_transactions_all_own" on public.bank_transactions;
create policy "bank_transactions_all_own" on public.bank_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounting_adjustments_all_own" on public.accounting_adjustments;
create policy "accounting_adjustments_all_own" on public.accounting_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.bank_transactions from anon, public;
revoke all on table public.accounting_adjustments from anon, public;
grant select, insert, update, delete on table public.bank_transactions to authenticated;
grant select, insert, update, delete on table public.accounting_adjustments to authenticated;

alter table public.sales_tax_periods
  add column if not exists auto_synced_at timestamptz;
