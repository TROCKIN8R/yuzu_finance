-- Bank reconciliation table + Wealthsimple CSV import columns
-- Safe on: empty DB, DB with accounting v3 only, DB already migrated.

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
  source_format text check (
    source_format is null or source_format in ('chequing', 'credit_card', 'manual')
  ),
  transaction_code text,
  import_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing accounting v3 installs (table without import columns)
alter table public.bank_transactions
  add column if not exists source_format text,
  add column if not exists transaction_code text,
  add column if not exists import_key text;

create index if not exists bank_transactions_user_id_idx on public.bank_transactions (user_id);
create index if not exists bank_transactions_date_idx on public.bank_transactions (transaction_date);

create unique index if not exists bank_transactions_user_import_key_idx
  on public.bank_transactions (user_id, import_key)
  where import_key is not null;

drop trigger if exists bank_transactions_set_user_id on public.bank_transactions;
create trigger bank_transactions_set_user_id
  before insert on public.bank_transactions
  for each row execute function public.set_user_id();

drop trigger if exists bank_transactions_updated_at on public.bank_transactions;
create trigger bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

alter table public.bank_transactions enable row level security;

drop policy if exists "bank_transactions_all_own" on public.bank_transactions;
create policy "bank_transactions_all_own" on public.bank_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.bank_transactions from anon, public;
grant select, insert, update, delete on table public.bank_transactions to authenticated;
