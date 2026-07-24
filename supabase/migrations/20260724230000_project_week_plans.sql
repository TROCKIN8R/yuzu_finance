-- Planned hours per project per calendar week (pipeline / future revenue).

create table if not exists public.project_week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  week_start date not null,
  hours numeric(6, 2) not null check (hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, week_start)
);

create index if not exists project_week_plans_user_id_idx
  on public.project_week_plans (user_id);
create index if not exists project_week_plans_project_id_idx
  on public.project_week_plans (project_id);
create index if not exists project_week_plans_week_start_idx
  on public.project_week_plans (user_id, week_start);

create trigger project_week_plans_set_user_id
  before insert on public.project_week_plans
  for each row execute function public.set_user_id();

create trigger project_week_plans_updated_at
  before update on public.project_week_plans
  for each row execute function public.set_updated_at();

alter table public.project_week_plans enable row level security;

create policy "project_week_plans_all_own" on public.project_week_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.project_week_plans from anon, public;
grant select, insert, update, delete on table public.project_week_plans to authenticated;
