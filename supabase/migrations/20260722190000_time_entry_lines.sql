-- Daily time sheets: one header per project per day, item lines inside.

create table public.time_entry_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  item_name text not null,
  hours numeric(6, 2) not null check (hours > 0),
  notes text,
  billable boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_entry_lines_user_id_idx on public.time_entry_lines (user_id);
create index time_entry_lines_time_entry_id_idx on public.time_entry_lines (time_entry_id);
create index time_entry_lines_item_name_idx on public.time_entry_lines (user_id, item_name);

create trigger time_entry_lines_set_user_id
  before insert on public.time_entry_lines
  for each row execute function public.set_user_id();

create trigger time_entry_lines_updated_at
  before update on public.time_entry_lines
  for each row execute function public.set_updated_at();

alter table public.time_entries
  add column if not exists notes text;

alter table public.time_entries
  alter column description drop not null;

-- Migrate legacy single-row entries into lines.
insert into public.time_entry_lines (user_id, time_entry_id, item_name, hours, notes, billable, sort_order)
select
  te.user_id,
  te.id,
  coalesce(nullif(trim(te.description), ''), 'Travail'),
  te.hours,
  null,
  te.billable,
  0
from public.time_entries te
where not exists (
  select 1 from public.time_entry_lines tel where tel.time_entry_id = te.id
);

create unique index if not exists time_entries_project_day_uniq
  on public.time_entries (
    user_id,
    project_id,
    entry_date,
    coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.time_entry_lines enable row level security;

create policy "time_entry_lines_all_own" on public.time_entry_lines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.time_entry_lines from anon, public;
grant select, insert, update, delete on table public.time_entry_lines to authenticated;
