-- Fixed-price projects and invoice line items with per-row taxes

alter table public.projects
  add column if not exists fixed_price numeric(10, 2) check (fixed_price is null or fixed_price >= 0);

alter table public.projects
  drop constraint if exists projects_billing_type_check;

alter table public.projects
  add constraint projects_billing_type_check check (billing_type in ('hourly', 'fixed'));

alter table public.projects
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists projects_invoice_id_idx on public.projects (invoice_id);

create table if not exists public.invoice_line_items (
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

create index if not exists invoice_line_items_user_id_idx on public.invoice_line_items (user_id);
create index if not exists invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);

drop trigger if exists invoice_line_items_set_user_id on public.invoice_line_items;
create trigger invoice_line_items_set_user_id
  before insert on public.invoice_line_items
  for each row execute function public.set_user_id();

drop trigger if exists invoice_line_items_updated_at on public.invoice_line_items;
create trigger invoice_line_items_updated_at
  before update on public.invoice_line_items
  for each row execute function public.set_updated_at();

alter table public.invoice_line_items enable row level security;

drop policy if exists "invoice_line_items_all_own" on public.invoice_line_items;
create policy "invoice_line_items_all_own" on public.invoice_line_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.invoice_line_items from anon, public;
grant select, insert, update, delete on table public.invoice_line_items to authenticated;
