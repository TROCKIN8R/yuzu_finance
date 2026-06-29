-- Shareholders registry (Québec corp dividends go to shareholders, not employees)

create table if not exists public.shareholders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legal_name text not null,
  email text,
  employee_id uuid references public.employees (id) on delete set null,
  shares_held numeric(12, 4) not null default 1 check (shares_held > 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shareholders_user_id_idx on public.shareholders (user_id);

drop trigger if exists shareholders_set_user_id on public.shareholders;
create trigger shareholders_set_user_id
  before insert on public.shareholders
  for each row execute function public.set_user_id();

drop trigger if exists shareholders_updated_at on public.shareholders;
create trigger shareholders_updated_at
  before update on public.shareholders
  for each row execute function public.set_updated_at();

alter table public.shareholders enable row level security;

drop policy if exists "shareholders_all_own" on public.shareholders;
create policy "shareholders_all_own" on public.shareholders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.shareholders from anon, public;
grant select, insert, update, delete on table public.shareholders to authenticated;

alter table public.dividend_allocations
  add column if not exists shareholder_id uuid references public.shareholders (id) on delete restrict;

alter table public.dividend_allocations
  alter column employee_id drop not null;

create unique index if not exists dividend_allocations_dividend_shareholder_idx
  on public.dividend_allocations (dividend_id, shareholder_id)
  where shareholder_id is not null;
