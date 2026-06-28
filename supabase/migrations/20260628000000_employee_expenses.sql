-- Employee expense reimbursement (out-of-pocket → payroll)
-- Run on existing projects that already have payroll_runs / employees.

alter table public.payroll_runs
  add column if not exists reimbursement_total numeric(12, 2) not null default 0;

create table if not exists public.employee_expenses (
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

create index if not exists employee_expenses_user_id_idx on public.employee_expenses (user_id);
create index if not exists employee_expenses_employee_id_idx on public.employee_expenses (employee_id);
create index if not exists employee_expenses_unreimbursed_idx on public.employee_expenses (user_id, employee_id)
  where payroll_run_id is null;

drop trigger if exists employee_expenses_set_user_id on public.employee_expenses;
create trigger employee_expenses_set_user_id
  before insert on public.employee_expenses
  for each row execute function public.set_user_id();

drop trigger if exists employee_expenses_updated_at on public.employee_expenses;
create trigger employee_expenses_updated_at
  before update on public.employee_expenses
  for each row execute function public.set_updated_at();

alter table public.employee_expenses enable row level security;

drop policy if exists "employee_expenses_all_own" on public.employee_expenses;
create policy "employee_expenses_all_own" on public.employee_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.employee_expenses from anon, public;
grant select, insert, update, delete on table public.employee_expenses to authenticated;
