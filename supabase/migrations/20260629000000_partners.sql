-- Replace clients with partners (customer / provider / both)

create type public.partner_kind as enum ('customer', 'provider', 'both');

alter table public.clients rename to partners;

alter table public.partners
  add column if not exists kind public.partner_kind not null default 'customer';

alter table public.projects rename column client_id to partner_id;
alter index if exists projects_client_id_idx rename to projects_partner_id_idx;

alter table public.invoices rename column client_id to partner_id;
alter index if exists invoices_client_id_idx rename to invoices_partner_id_idx;

alter index if exists clients_user_id_idx rename to partners_user_id_idx;

alter trigger clients_set_user_id on public.partners rename to partners_set_user_id;
alter trigger clients_updated_at on public.partners rename to partners_updated_at;

drop policy if exists "clients_all_own" on public.partners;

create policy "partners_all_own" on public.partners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.partners from anon, public;
grant select, insert, update, delete on table public.partners to authenticated;
