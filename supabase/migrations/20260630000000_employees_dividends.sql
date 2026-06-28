-- v3: employees, dividends, time/payroll employee links

create type public.pay_frequency as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');

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

create trigger employees_set_user_id before insert on public.employees
  for each row execute function public.set_user_id();
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Link payroll runs and time entries to employees
-- ---------------------------------------------------------------------------

alter table public.payroll_runs
  add column employee_id uuid references public.employees (id) on delete restrict;

create index payroll_runs_employee_id_idx on public.payroll_runs (employee_id);

alter table public.time_entries
  add column employee_id uuid references public.employees (id) on delete restrict;

create index time_entries_employee_id_idx on public.time_entries (employee_id);

-- ---------------------------------------------------------------------------
-- Dividends (split equally among active employees at creation)
-- ---------------------------------------------------------------------------

create table public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_date date not null default current_date,
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

create trigger dividends_set_user_id before insert on public.dividends
  for each row execute function public.set_user_id();
create trigger dividends_updated_at before update on public.dividends
  for each row execute function public.set_updated_at();
create trigger dividend_allocations_set_user_id before insert on public.dividend_allocations
  for each row execute function public.set_user_id();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.dividends enable row level security;
alter table public.dividend_allocations enable row level security;

create policy "employees_all_own" on public.employees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dividends_all_own" on public.dividends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dividend_allocations_all_own" on public.dividend_allocations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.employees from anon, public;
revoke all on table public.dividends from anon, public;
revoke all on table public.dividend_allocations from anon, public;

grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.dividends to authenticated;
grant select, insert, update, delete on table public.dividend_allocations to authenticated;
