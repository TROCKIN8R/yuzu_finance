-- Yuzu Finance — private schema with row-level security (single-owner per user)

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legal_name text not null,
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

create index clients_user_id_idx on public.clients (user_id);

create trigger clients_set_user_id
  before insert on public.clients
  for each row execute function public.set_user_id();

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  status public.project_status not null default 'active',
  default_hourly_rate numeric(10, 2) not null,
  currency text not null default 'CAD',
  billing_type text not null default 'hourly',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_client_id_idx on public.projects (client_id);

create trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  entry_date date not null,
  hours numeric(6, 2) not null check (hours > 0),
  description text not null,
  billable boolean not null default true,
  rate_override numeric(10, 2),
  invoice_id uuid, -- FK added after invoices table
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_entries_user_id_idx on public.time_entries (user_id);
create index time_entries_project_id_idx on public.time_entries (project_id);
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

create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  qst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status public.invoice_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create index invoices_user_id_idx on public.invoices (user_id);
create index invoices_client_id_idx on public.invoices (client_id);

create trigger invoices_set_user_id
  before insert on public.invoices
  for each row execute function public.set_user_id();

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.time_entries
  add constraint time_entries_invoice_id_fkey
  foreign key (invoice_id) references public.invoices (id) on delete set null;

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
-- Row Level Security — only the owning user can access their rows
-- ---------------------------------------------------------------------------

alter table public.organization_settings enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

create policy "settings_select_own" on public.organization_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.organization_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.organization_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "clients_all_own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "time_entries_all_own" on public.time_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoices_all_own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "payments_all_own" on public.payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
