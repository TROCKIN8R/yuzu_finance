-- Compliance calendar + project PDF contracts (document_entity_type)

-- ---------------------------------------------------------------------------
-- Extend document attachments to projects (MSA / contracts)
-- ---------------------------------------------------------------------------

alter type public.document_entity_type add value if not exists 'project';

-- ---------------------------------------------------------------------------
-- Compliance deadlines
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.compliance_deadline_status as enum ('open', 'done', 'skipped');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.compliance_deadline_category as enum (
    'payroll_remittance',
    'sales_tax',
    'corporate_tax',
    'annual_return',
    'insurance',
    'contract',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.compliance_deadline_source as enum (
    'manual',
    'seed',
    'sales_tax',
    'corporate_tax'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.compliance_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category public.compliance_deadline_category not null default 'other',
  due_date date not null,
  status public.compliance_deadline_status not null default 'open',
  source public.compliance_deadline_source not null default 'manual',
  source_key text,
  amount numeric(12, 2),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_deadlines_source_key_unique unique (user_id, source_key)
);

create index if not exists compliance_deadlines_user_id_idx
  on public.compliance_deadlines (user_id);

create index if not exists compliance_deadlines_due_date_idx
  on public.compliance_deadlines (user_id, due_date);

drop trigger if exists compliance_deadlines_set_user_id on public.compliance_deadlines;
create trigger compliance_deadlines_set_user_id
  before insert on public.compliance_deadlines
  for each row execute function public.set_user_id();

drop trigger if exists compliance_deadlines_updated_at on public.compliance_deadlines;
create trigger compliance_deadlines_updated_at
  before update on public.compliance_deadlines
  for each row execute function public.set_updated_at();

alter table public.compliance_deadlines enable row level security;

drop policy if exists "compliance_deadlines_all_own" on public.compliance_deadlines;
create policy "compliance_deadlines_all_own" on public.compliance_deadlines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.compliance_deadlines from anon, public;
grant select, insert, update, delete on table public.compliance_deadlines to authenticated;
