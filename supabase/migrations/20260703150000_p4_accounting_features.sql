-- P4: WIP accrual settings, Québec employer levies, fiscal period close

alter table public.organization_settings
  add column if not exists wip_accrual_enabled boolean not null default false,
  add column if not exists hsf_rate numeric(6, 5) not null default 0.0165,
  add column if not exists cnesst_rate numeric(6, 5) not null default 0.01;

alter table public.payroll_runs
  add column if not exists hsf_employer numeric(12, 2) not null default 0,
  add column if not exists cnesst_employer numeric(12, 2) not null default 0;

create table if not exists public.fiscal_period_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_end date not null,
  notes text,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, period_end)
);

create index if not exists fiscal_period_closes_user_id_idx on public.fiscal_period_closes (user_id);

drop trigger if exists fiscal_period_closes_set_user_id on public.fiscal_period_closes;
create trigger fiscal_period_closes_set_user_id
  before insert on public.fiscal_period_closes
  for each row execute function public.set_user_id();

alter table public.fiscal_period_closes enable row level security;

drop policy if exists "fiscal_period_closes_all_own" on public.fiscal_period_closes;
create policy "fiscal_period_closes_all_own" on public.fiscal_period_closes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.fiscal_period_closes from anon, public;
grant select, insert, update, delete on table public.fiscal_period_closes to authenticated;
