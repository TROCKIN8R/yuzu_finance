-- Accounting adjustments table (manual journal entries, prepaids, etc.)

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

alter table public.accounting_adjustments enable row level security;

drop policy if exists "accounting_adjustments_all_own" on public.accounting_adjustments;
create policy "accounting_adjustments_all_own" on public.accounting_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.accounting_adjustments from anon, public;
grant select, insert, update, delete on table public.accounting_adjustments to authenticated;
